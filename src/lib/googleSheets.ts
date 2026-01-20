// Edge Runtime対応のため、googleapisを排除し、標準fetchとjoseを使用する
import { SignJWT, importPKCS8 } from 'jose';

/**
 * 環境変数を取得
 */
function getEnvVariables() {
    const GOOGLE_SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const GOOGLE_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
    const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID;

    return { GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY, GOOGLE_SHEET_ID };
}

/**
 * Access Tokenを取得する (joseを使用)
 */
async function getAccessToken(): Promise<string> {
    const { GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY } = getEnvVariables();

    if (!GOOGLE_SERVICE_ACCOUNT_EMAIL || !GOOGLE_PRIVATE_KEY) {
        throw new Error('Google Sheets credentials not configured');
    }

    const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

    try {
        const alg = 'RS256';
        const pkcs8 = await importPKCS8(GOOGLE_PRIVATE_KEY, alg);

        const jwt = await new SignJWT({
            scope: SCOPES.join(' '),
        })
            .setProtectedHeader({ alg })
            .setIssuer(GOOGLE_SERVICE_ACCOUNT_EMAIL)
            .setSubject(GOOGLE_SERVICE_ACCOUNT_EMAIL)
            .setAudience('https://oauth2.googleapis.com/token')
            .setIssuedAt()
            .setExpirationTime('1h')
            .sign(pkcs8);

        const params = new URLSearchParams();
        params.append('grant_type', 'urn:ietf:params:oauth:grant-type:jwt-bearer');
        params.append('assertion', jwt);

        const response = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: params,
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to get access token: ${response.status} ${errorText}`);
        }

        const data = await response.json();
        return data.access_token;

    } catch (error) {
        console.error('Error in getAccessToken:', error);
        throw error;
    }
}

/**
 * スプレッドシートIDを取得
 */
export function getSheetId(): string {
    const { GOOGLE_SHEET_ID } = getEnvVariables();

    if (!GOOGLE_SHEET_ID) {
        throw new Error('GOOGLE_SHEET_ID not configured');
    }
    return GOOGLE_SHEET_ID;
}

/**
 * 銘柄マスタデータの型定義
 */
export type MasterDataEntry = {
    name: string;
    sector33: string;
    sector: string;
};

export type MasterDataMap = {
    [code: string]: MasterDataEntry;
};

// マスタデータのキャッシュ
let masterDataCache: MasterDataMap | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL = 1000 * 60 * 60; // 1時間

/**
 * ローカルCSVから銘柄マスタデータを取得 (Edge Runtime対応版)
 * 
 * CSVファイル: public/stock_master.csv
 */
export async function fetchMasterData(): Promise<MasterDataMap> {
    const now = Date.now();
    if (masterDataCache && (now - cacheTimestamp) < CACHE_TTL) {
        console.log(`[MasterData] キャッシュから${Object.keys(masterDataCache).length}件のマスタデータを返却`);
        return masterDataCache;
    }

    console.log('[MasterData] fetchでマスタデータ取得開始...');

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const csvUrl = `${baseUrl.replace(/\/$/, '')}/stock_master.csv`;

    console.log(`[MasterData] Fetching CSV from: ${csvUrl}`);

    try {
        const response = await fetch(csvUrl, {
            next: { revalidate: 3600 }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch CSV: ${response.status} ${response.statusText}`);
        }

        const csvContent = await response.text();
        const lines = csvContent.split(/\r?\n/);
        const masterData: MasterDataMap = {};

        for (let i = 1; i < lines.length; i++) {
            const line = lines[i];
            if (!line.trim()) continue;

            const columns = line.split(',');
            const rawCode = String(columns[1] || '');
            const code = rawCode.split('.')[0].trim();
            if (!code) continue;

            const name = String(columns[2] || '').trim();
            const sector = String(columns[7] || '').trim();

            masterData[code] = {
                name: name,
                sector33: '',
                sector: sector,
            };
        }

        masterDataCache = masterData;
        cacheTimestamp = now;

        console.log(`[MasterData] ${Object.keys(masterData).length}件のマスタデータを読み込みました`);
        return masterData;

    } catch (error) {
        console.error('[MasterData] CSV fetch error:', error);
        return {};
    }
}

/**
 * 特定のコードのマスタデータを検索
 */
export async function lookupMasterData(code: string): Promise<MasterDataEntry | null> {
    const masterData = await fetchMasterData();
    return masterData[code] || null;
}

/**
 * 複数コードのマスタデータを一括検索
 */
export async function lookupMasterDataBatch(codes: string[]): Promise<MasterDataMap> {
    const masterData = await fetchMasterData();
    const result: MasterDataMap = {};

    for (const code of codes) {
        if (masterData[code]) {
            result[code] = masterData[code];
        }
    }
    return result;
}

/**
 * 価格文字列をクレンジングして数値に変換
 */
export function cleanPriceString(rawValue: unknown): number {
    if (rawValue === undefined || rawValue === null) return 0;
    const str = String(rawValue);

    if (str.includes('#N/A') || str.includes('#ERROR') || str.includes('#REF') || str.includes('#VALUE')) {
        return 0;
    }

    let cleaned = str.replace(/[¥￥円,、\s]/g, '');
    cleaned = cleaned.replace(/[０-９]/g, (s) =>
        String.fromCharCode(s.charCodeAt(0) - 0xFEE0)
    );

    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
}

/**
 * 株価取得結果の型定義
 */
export type PriceMap = {
    [code: string]: number;
};

/**
 * シート2を使用して最新の株価を取得（Google Sheets REST API + fetch版）
 */
export async function fetchPricesViaSheet2(codes: string[]): Promise<PriceMap> {
    console.log(`[GoogleSheets] fetchPricesViaSheet2 開始: ${codes.length}件の銘柄`);

    if (codes.length === 0) {
        console.log('[GoogleSheets] 銘柄コードが空のため終了');
        return {};
    }

    try {
        // Step 1: Access Token 取得
        console.log('[GoogleSheets] Step 1: Access Token取得中...');
        const accessToken = await getAccessToken();
        const sheetId = getSheetId();
        console.log('[GoogleSheets] Step 1: Access Token取得完了');

        // 共通ヘッダー
        const headers = {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        };

        // Step 2: シート2の A列をクリア (POST :clear)
        console.log('[GoogleSheets] Step 2: シート2のA列をクリア中...');
        const clearUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/シート2!A2:A500:clear`;
        const clearRes = await fetch(clearUrl, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({}),
        });

        if (!clearRes.ok) {
            const err = await clearRes.text();
            throw new Error(`Clear failed: ${clearRes.status} ${err}`);
        }
        console.log('[GoogleSheets] Step 2: クリア完了');

        // Step 3: 銘柄コードを A列に書き込み (PUT ?valueInputOption=RAW)
        console.log('[GoogleSheets] Step 3: 銘柄コードを書き込み中...');
        const values = codes.map(code => [code]);
        const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/シート2!A2?valueInputOption=RAW`;

        const updateRes = await fetch(updateUrl, {
            method: 'PUT',
            headers: headers,
            body: JSON.stringify({
                values: values
            })
        });

        if (!updateRes.ok) {
            const err = await updateRes.text();
            throw new Error(`Update failed: ${updateRes.status} ${err}`);
        }
        console.log(`[GoogleSheets] Step 3: ${codes.length}件のコードを書き込み完了`);


        // Step 4: IMPORTXMLの計算完了を待機（7秒）
        console.log('[GoogleSheets] Step 4: IMPORTXML計算待機中（7秒）...');
        await new Promise(resolve => setTimeout(resolve, 7000));
        console.log('[GoogleSheets] Step 4: 待機完了');


        // Step 5: B列から株価を読み取り (GET)
        console.log('[GoogleSheets] Step 5: 株価データを読み取り中...');
        const endRow = codes.length + 1; // A2から開始なので +1
        const getUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/シート2!A2:B${endRow}`;

        const getRes = await fetch(getUrl, {
            method: 'GET',
            headers: headers,
        });

        if (!getRes.ok) {
            const err = await getRes.text();
            throw new Error(`Get failed: ${getRes.status} ${err}`);
        }

        const getData = await getRes.json();
        const rows = getData.values || [];
        const priceMap: PriceMap = {};

        for (const row of rows) {
            const code = String(row[0] || '').split('.')[0].trim();
            const priceRaw = row[1];

            if (!code) continue;

            // クレンジング関数を使用して円マーク等を除去
            priceMap[code] = cleanPriceString(priceRaw);
        }

        console.log(`[GoogleSheets] Step 5: ${Object.keys(priceMap).length}件の株価を取得完了`);
        console.log('[GoogleSheets] fetchPricesViaSheet2 完了');
        return priceMap;

    } catch (error) {
        console.error('[GoogleSheets] Error:', error);
        return {}; // エラーハンドリング（空で返す）
    }
}

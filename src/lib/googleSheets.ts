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

    const CHUNK_SIZE = 30;
    const WAIT_TIME_MS = 15000;
    const MAX_RETRIES_PER_CHUNK = 3;

    // chunkに分割
    const chunks: string[][] = [];
    for (let i = 0; i < codes.length; i += CHUNK_SIZE) {
        chunks.push(codes.slice(i, i + CHUNK_SIZE));
    }

    console.log(`[GoogleSheets] バッチ処理開始: 全${chunks.length}チャンク (Chunk Size: ${CHUNK_SIZE})`);

    const finalPriceMap: PriceMap = {};
    const accessToken = await getAccessToken();
    const sheetId = getSheetId();

    const headers = {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
    };

    for (let i = 0; i < chunks.length; i++) {
        const chunkIndex = i + 1;
        const currentChunk = chunks[i];
        console.log(`[GoogleSheets] Chunk ${chunkIndex}/${chunks.length} 処理開始 (${currentChunk.length}件)...`);

        let chunkSuccess = false;

        // チャンクごとのリトライ処理
        for (let attempt = 1; attempt <= MAX_RETRIES_PER_CHUNK; attempt++) {
            if (chunkSuccess) break;

            try {
                if (attempt > 1) console.log(`[GoogleSheets] Chunk ${chunkIndex} - Retry ${attempt}...`);

                // Step 1: シート2の A列をクリア
                const clearUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/シート2!A2:A500:clear`;
                const clearRes = await fetch(clearUrl, {
                    method: 'POST',
                    headers: headers,
                    body: JSON.stringify({}),
                });
                if (!clearRes.ok) throw new Error(`Clear failed: ${clearRes.status}`);

                // Step 2: 銘柄コード書き込み
                const values = currentChunk.map(code => [code]);
                const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/シート2!A2?valueInputOption=RAW`;
                const updateRes = await fetch(updateUrl, {
                    method: 'PUT',
                    headers: headers,
                    body: JSON.stringify({ values: values })
                });
                if (!updateRes.ok) throw new Error(`Update failed: ${updateRes.status}`);

                // Step 3: 計算待機
                console.log(`[GoogleSheets] Chunk ${chunkIndex}: 待機中 (${WAIT_TIME_MS}ms)...`);
                await new Promise(resolve => setTimeout(resolve, WAIT_TIME_MS));

                // Step 4: 読み取り
                const endRow = currentChunk.length + 1;
                const getUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/シート2!A2:B${endRow}`;
                const getRes = await fetch(getUrl, { method: 'GET', headers: headers });

                if (!getRes.ok) throw new Error(`Get failed: ${getRes.status}`);

                const getData = await getRes.json();
                const rows = getData.values || [];

                let foundInChunk = 0;
                for (const row of rows) {
                    const code = String(row[0] || '').split('.')[0].trim();
                    const priceRaw = row[1];
                    if (!code) continue;

                    const price = cleanPriceString(priceRaw);
                    finalPriceMap[code] = price;
                    if (price > 0) foundInChunk++;
                }

                console.log(`[GoogleSheets] Chunk ${chunkIndex}: ${foundInChunk}件の有効株価を取得`);

                // 成功判定 (少なくともエラーなく完了)
                chunkSuccess = true;

            } catch (error) {
                console.error(`[GoogleSheets] Chunk ${chunkIndex} Error (Attempt ${attempt}):`, error);
                if (attempt < MAX_RETRIES_PER_CHUNK) {
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
            }
        }

        if (!chunkSuccess) {
            console.error(`[GoogleSheets] Chunk ${chunkIndex} は全リトライ失敗しました。スキップします。`);
        }

        // 次のチャンクへのクールダウン（少し待つ）
        if (i < chunks.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    console.log(`[GoogleSheets] 全バッチ処理完了. Total Fetched: ${Object.keys(finalPriceMap).length}件`);
    return finalPriceMap;
}

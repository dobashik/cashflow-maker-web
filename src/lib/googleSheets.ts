// Node.js ランタイム指定を削除（Edge互換にするため）
// export const runtime = 'nodejs';

/**
 * Google Sheets API 連携モジュール
 * 
 * Google Sheets を「計算エンジン」として利用するためのユーティリティ。
 * - シート1: 銘柄マスタ（4,000銘柄のコード、名称、セクター情報）
 * - シート2: 計算ワークスペース（IMPORTXMLで株価取得）
 * 
 * Note: googleapis は serverExternalPackages に設定済み（next.config.ts）
 */

import { google, sheets_v4 } from 'googleapis';

/**
 * 環境変数を取得（Node.js環境で確実に実行）
 */
function getEnvVariables() {
    const GOOGLE_SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const GOOGLE_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
    const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID;

    return { GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY, GOOGLE_SHEET_ID };
}

/**
 * Google Sheets API クライアントを取得
 */
export async function getGoogleSheets(): Promise<sheets_v4.Sheets> {
    const { GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY } = getEnvVariables();

    if (!GOOGLE_SERVICE_ACCOUNT_EMAIL || !GOOGLE_PRIVATE_KEY) {
        throw new Error('Google Sheets credentials not configured');
    }

    const auth = new google.auth.GoogleAuth({
        credentials: {
            client_email: GOOGLE_SERVICE_ACCOUNT_EMAIL,
            private_key: GOOGLE_PRIVATE_KEY,
        },
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const authClient = await auth.getClient();
    return google.sheets({ version: 'v4', auth: authClient as any });
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
 * file system (fs) を使用せず、Web上の静的アセットとして fetch で取得する。
 * 
 * CSVファイル: public/stock_master.csv
 * 列マッピング:
 * - B列 (index 1): 銘柄コード（1301.0 → 1301 に正規化）
 * - C列 (index 2): 銘柄名
 * - H列 (index 7): 17業種区分（sector）
 */
export async function fetchMasterData(): Promise<MasterDataMap> {
    // キャッシュが有効な場合はキャッシュを返す
    const now = Date.now();
    if (masterDataCache && (now - cacheTimestamp) < CACHE_TTL) {
        console.log(`[MasterData] キャッシュから${Object.keys(masterDataCache).length}件のマスタデータを返却`);
        return masterDataCache;
    }

    console.log('[MasterData] fetchでマスタデータ取得開始...');

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    // URL構築時にはスラッシュの重複に注意
    const csvUrl = `${baseUrl.replace(/\/$/, '')}/stock_master.csv`;

    console.log(`[MasterData] Fetching CSV from: ${csvUrl}`);

    try {
        const response = await fetch(csvUrl, {
            next: { revalidate: 3600 } // 1時間キャッシュ
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch CSV: ${response.status} ${response.statusText}`);
        }

        const csvContent = await response.text();

        // 改行で行分割（Windows/Mac/Linux対応）
        const lines = csvContent.split(/\r?\n/);
        const masterData: MasterDataMap = {};

        // ヘッダー行をスキップ（index 0）
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i];
            if (!line.trim()) continue;

            // カンマで列分割
            const columns = line.split(',');

            // B列 (index 1): 銘柄コード - 「1301.0」のような形式を「1301」に正規化
            const rawCode = String(columns[1] || '');
            const code = rawCode.split('.')[0].trim();
            if (!code) continue;

            // C列 (index 2): 銘柄名
            const name = String(columns[2] || '').trim();

            // H列 (index 7): 17業種区分 → sectorカラムにマッピング
            const sector = String(columns[7] || '').trim();

            masterData[code] = {
                name: name,
                sector33: '', // CSVには33業種区分は含まない（必要に応じて追加可能）
                sector: sector,
            };
        }

        // キャッシュを更新
        masterDataCache = masterData;
        cacheTimestamp = now;

        console.log(`[MasterData] ${Object.keys(masterData).length}件のマスタデータを読み込みました`);
        return masterData;

    } catch (error) {
        console.error('[MasterData] CSV fetch error:', error);
        // エラー時は空オブジェクトを返す（アプリをクラッシュさせないため）
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
 * 「¥3,714」「￥3714」「3,714円」のようなパターンに対応
 */
export function cleanPriceString(rawValue: unknown): number {
    if (rawValue === undefined || rawValue === null) return 0;

    const str = String(rawValue);

    // エラー値チェック
    if (str.includes('#N/A') || str.includes('#ERROR') || str.includes('#REF') || str.includes('#VALUE')) {
        return 0;
    }

    // 円マーク、全角円マーク、カンマ、全角カンマ、円、スペースを除去
    let cleaned = str
        .replace(/[¥￥円,、\s]/g, '');

    // 全角数字を半角に変換
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
 * シート2を使用して最新の株価を取得（IMPORTXML対応版）
 * 
 * 処理フロー:
 * 1. シート2の A列（A2以降）をクリアし銘柄コードを一括書き込み
 * 2. IMPORTXMLの反映を待機（5秒）
 * 3. B列から株価を読み取り、クレンジング処理を実行
 * 
 * @param codes 銘柄コードの配列（最大100件推奨）
 * @returns { [code: string]: number } 形式の株価マップ
 */
export async function fetchPricesViaSheet2(codes: string[]): Promise<PriceMap> {
    console.log(`[GoogleSheets] fetchPricesViaSheet2 開始: ${codes.length}件の銘柄`);

    if (codes.length === 0) {
        console.log('[GoogleSheets] 銘柄コードが空のため終了');
        return {};
    }

    console.log('[GoogleSheets] Step 1: Google認証を開始...');
    const sheets = await getGoogleSheets();
    console.log('[GoogleSheets] Step 1: Google認証完了');

    const sheetId = getSheetId();
    console.log(`[GoogleSheets] シートID取得: ${sheetId.substring(0, 10)}...`);

    // Step 2: シート2の A列をクリア
    console.log('[GoogleSheets] Step 2: シート2のA列をクリア中...');
    await sheets.spreadsheets.values.clear({
        spreadsheetId: sheetId,
        range: 'シート2!A2:A500',
    });
    console.log('[GoogleSheets] Step 2: クリア完了');

    // Step 3: 銘柄コードを A列に書き込み
    console.log('[GoogleSheets] Step 3: 銘柄コードを書き込み中...');
    const values = codes.map(code => [code]);
    await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: 'シート2!A2',
        valueInputOption: 'RAW',
        requestBody: {
            values: values,
        },
    });
    console.log(`[GoogleSheets] Step 3: ${codes.length}件のコードを書き込み完了`);

    // Step 4: IMPORTXMLの計算完了を待機（7秒 - 特定銘柄の取得漏れを防ぐため延長）
    console.log('[GoogleSheets] Step 4: IMPORTXML計算待機中（7秒）...');
    await new Promise(resolve => setTimeout(resolve, 7000));
    console.log('[GoogleSheets] Step 4: 待機完了');

    // Step 5: B列から株価を読み取り
    console.log('[GoogleSheets] Step 5: 株価データを読み取り中...');
    const endRow = codes.length + 1; // A2から開始なので +1
    const response = await sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range: `シート2!A2:B${endRow}`,
    });

    const rows = response.data.values || [];
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
}

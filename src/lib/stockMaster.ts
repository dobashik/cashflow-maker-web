// 銘柄マスタデータ（public/stock_master.csv）の読み込みユーティリティ
// 株価はCSVインポート時に取り込んだ値（holdings.price）を正とするため、
// 外部サービスからの株価取得は行わない。

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

            // Robust CSV split: Split by comma ONLY if an even number of quotes follow.
            // This handles "Company, Inc." correctly and preserves empty fields.
            const columns = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(col => {
                return col.replace(/^"|"$/g, '').trim();
            });

            // Index 1: Code, Index 2: Name, Index 7: Sector17
            const rawCode = columns[1] || '';
            const code = rawCode.split('.')[0]; // Handle cases like '1301.0'

            if (!code) continue;

            const name = columns[2] || '';
            const sector = columns[7] || '';

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

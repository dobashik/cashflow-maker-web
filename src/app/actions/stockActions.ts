'use server';

// Note: Server Actions は Node.js 環境で実行されます
// googleapis は serverExternalPackages に設定済みのため、自動的に Node.js ランタイムで実行されます
// googleapis は serverExternalPackages に設定済み（next.config.ts）

/**
 * 株価取得・更新アクション
 * 
 * Google Sheets の シート2（計算ワークスペース）を活用して
 * IMPORTXML で最新の株価を取得する
 * 
 * Note: googleapis は serverExternalPackages に設定済み（next.config.ts）
 */

import {
    fetchPricesViaSheet2,
    cleanPriceString,
    fetchMasterData,
    PriceMap,
    MasterDataMap
} from '@/lib/googleSheets';
import { createClient } from '@/utils/supabase/server';

/**
 * シート2を使用して最新の株価を取得
 * 
 * 処理フロー:
 * 1. シート2の A列（A2以降）に銘柄コードを一括書き込み
 * 2. IMPORTXMLの計算完了を待機（3秒）
 * 3. B列から現在の株価を読み取り（円マーク対応）
 * 
 * @param codes 銘柄コードの配列（最大100件推奨）
 * @returns { [code: string]: number } 形式の株価マップ
 */
export async function fetchLatestPrices(codes: string[]): Promise<PriceMap> {
    return fetchPricesViaSheet2(codes);
}

/**
 * 単一銘柄の株価を取得
 */
export async function fetchSinglePrice(code: string): Promise<number> {
    const prices = await fetchLatestPrices([code]);
    return prices[code] || 0;
}

/**
 * 銘柄にセクター情報を付与
 * シート1（マスタデータ）から33業種・17業種情報を取得
 */
export async function enrichHoldingsWithSectorData(codes: string[]): Promise<MasterDataMap> {
    if (codes.length === 0) {
        return {};
    }

    const masterData = await fetchMasterData();
    const result: MasterDataMap = {};

    for (const code of codes) {
        // コードを正規化して照合（数値/文字列の差異や「130A」のような文字混じりコードに対応）
        const normalizedCode = String(code).trim();
        if (masterData[normalizedCode]) {
            result[normalizedCode] = masterData[normalizedCode];
        }
    }

    console.log(`[stockActions] Enriched ${Object.keys(result).length} holdings with sector data`);
    return result;
}

export type UpdateResult = {
    success: boolean;
    updatedCount: number;
    pricesFound: number;
    message: string;
};

/**
 * 全銘柄の株価を一括更新
 * 
 * 処理フロー:
 * 1. Supabase holdings テーブルから全銘柄コードを取得
 * 2. シート2経由で最新株価を取得
 * 3. holdingsテーブルのpriceカラムを更新
 */
export async function updateAllStockPrices(userId: string): Promise<UpdateResult> {
    try {
        const supabase = await createClient();

        // Step 1: holdings テーブルから銘柄コードを取得
        const { data: holdings, error: fetchError } = await supabase
            .from('holdings')
            .select('id, code')
            .eq('user_id', userId);

        if (fetchError) {
            console.error('[stockActions] Failed to fetch holdings:', fetchError);
            return {
                success: false,
                updatedCount: 0,
                pricesFound: 0,
                message: 'データの取得に失敗しました',
            };
        }

        if (!holdings || holdings.length === 0) {
            return {
                success: true,
                updatedCount: 0,
                pricesFound: 0,
                message: '更新対象の銘柄がありません',
            };
        }

        // 重複排除した銘柄コードリスト（String().trim() で正規化）
        const uniqueCodes = [...new Set(holdings.map(h => String(h.code).trim()))];
        console.log(`[stockActions] Fetching prices for ${uniqueCodes.length} unique codes`);

        // Step 2: シート2経由で株価を取得
        const priceMap = await fetchPricesViaSheet2(uniqueCodes);
        const pricesFound = Object.values(priceMap).filter(p => p > 0).length;

        // Step 3: 各holdingレコードを更新（取得失敗した銘柄はprice: 0を明示的に設定）
        let updatedCount = 0;
        let failedCount = 0;
        for (const holding of holdings) {
            const normalizedCode = String(holding.code).trim();
            const newPrice = priceMap[normalizedCode];
            const priceToSet = (newPrice && newPrice > 0) ? newPrice : 0;

            const { error: updateError } = await supabase
                .from('holdings')
                .update({
                    price: priceToSet,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', holding.id)
                .eq('user_id', userId);

            if (!updateError) {
                if (priceToSet > 0) {
                    updatedCount++;
                } else {
                    failedCount++;
                    console.warn(`[stockActions] Price fetch failed for ${holding.code}, set to 0`);
                }
            } else {
                console.error(`[stockActions] Failed to update ${holding.code}:`, updateError);
            }
        }

        if (failedCount > 0) {
            console.log(`[stockActions] ${failedCount}件の銘柄で株価取得に失敗しました`);
        }

        console.log(`[stockActions] Updated ${updatedCount} holdings with new prices`);

        return {
            success: true,
            updatedCount,
            pricesFound,
            message: failedCount > 0
                ? `${updatedCount}件の株価を更新しました（${failedCount}件は取得に失敗）`
                : `${updatedCount}件の株価を更新しました`,
        };
    } catch (error) {
        console.error('[stockActions] updateAllStockPrices error:', error);
        return {
            success: false,
            updatedCount: 0,
            pricesFound: 0,
            message: '株価更新中にエラーが発生しました',
        };
    }
}

/**
 * 全銘柄のセクター情報を一括更新
 * ※ sector が null または空文字列のレコードのみを更新対象とする（効率化）
 */
export async function updateAllSectorData(userId: string): Promise<{ success: boolean; updatedCount: number; message: string }> {
    try {
        const supabase = await createClient();

        // Step 1: holdings テーブルから sector が未設定の銘柄コードを取得
        const { data: holdings, error: fetchError } = await supabase
            .from('holdings')
            .select('id, code, sector')
            .eq('user_id', userId)
            .eq('user_id', userId)
            .or('sector.is.null,sector.eq.,sector.eq.その他');

        if (fetchError) {
            console.error('[stockActions] Failed to fetch holdings:', fetchError);
            return {
                success: false,
                updatedCount: 0,
                message: 'データの取得に失敗しました',
            };
        }

        if (!holdings || holdings.length === 0) {
            return {
                success: true,
                updatedCount: 0,
                message: 'セクター情報は既に最新です',
            };
        }

        // 重複排除した銘柄コードリスト（String().trim() で正規化）
        const uniqueCodes = [...new Set(holdings.map(h => String(h.code).trim()))];

        // Step 2: マスタデータからセクター情報を取得
        const sectorData = await enrichHoldingsWithSectorData(uniqueCodes);

        // Step 3: 各holdingレコードを更新（コードの型を正規化して照合）
        let updatedCount = 0;
        for (const holding of holdings) {
            const normalizedCode = String(holding.code).trim();
            const sector = sectorData[normalizedCode];
            if (sector) {
                const { error: updateError } = await supabase
                    .from('holdings')
                    .update({
                        name: sector.name || undefined,
                        sector: sector.sector,
                        updated_at: new Date().toISOString(),
                    })
                    .eq('id', holding.id)
                    .eq('user_id', userId);

                if (!updateError) {
                    updatedCount++;
                }
            }
        }

        return {
            success: true,
            updatedCount,
            message: `${updatedCount}件のセクター情報を更新しました`,
        };
    } catch (error) {
        console.error('[stockActions] updateAllSectorData error:', error);
        return {
            success: false,
            updatedCount: 0,
            message: 'セクター情報更新中にエラーが発生しました',
        };
    }
}


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

/**
 * 分析データの更新アクション
 * CSVインポートされた分析データを holdings テーブルに反映する
 */
export async function updateHoldingAnalysisData(
    items: { code: string; ir_rank: string; ir_score: number; ir_detail: string; ir_flag: string; ir_date: string }[]
): Promise<{ success: boolean; updatedCount: number; message: string }> {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return { success: false, updatedCount: 0, message: 'ログインが必要です' };
        }

        if (items.length === 0) {
            return { success: true, updatedCount: 0, message: '更新対象のデータがありません' };
        }

        // ユーザーの保有銘柄を取得
        const { data: holdings, error: fetchError } = await supabase
            .from('holdings')
            .select('id, code')
            .eq('user_id', user.id);

        if (fetchError || !holdings) {
            console.error('Fetch Holdings Error:', fetchError);
            return { success: false, updatedCount: 0, message: '保有データの取得に失敗しました' };
        }

        // Code -> ID[] Map (1つのコードに複数のIDが紐づく可能性がある: SBI/Rakuten)
        const holdingMap = new Map<string, string[]>();
        holdings.forEach(h => {
            const c = String(h.code).trim();
            const list = holdingMap.get(c) || [];
            list.push(h.id);
            holdingMap.set(c, list);
        });

        let updatedCount = 0;

        for (const item of items) {
            const ids = holdingMap.get(String(item.code).trim());
            if (ids && ids.length > 0) {
                // 該当する全ての保有レコードを更新
                const { error: updateError } = await supabase
                    .from('holdings')
                    .update({
                        ir_rank: item.ir_rank,
                        ir_score: item.ir_score,
                        ir_detail: item.ir_detail,
                        ir_flag: item.ir_flag,
                        ir_date: item.ir_date,
                        updated_at: new Date().toISOString()
                    })
                    .in('id', ids) // 複数IDを一括更新
                    .eq('user_id', user.id);

                if (!updateError) {
                    updatedCount += ids.length;
                } else {
                    console.error(`Update Error for ${item.code}:`, updateError);
                }
            }
        }

        console.log(`[stockActions] Analysis Data Update: ${updatedCount} records updated.`);
        return {
            success: true,
            updatedCount,
            message: `${updatedCount}件の分析データを更新しました`
        };

    } catch (error) {
        console.error('updateHoldingAnalysisData error:', error);
        return { success: false, updatedCount: 0, message: 'サーバーエラーが発生しました' };
    }
}


/**
 * 保有資産データの保存（追加/上書きモード対応）
 */
import { Holding } from '@/lib/mockData';

/**
 * 保有データを集約（同一コード・同一ソースをマージ）
 */
function aggregateHoldings(items: Holding[]): Holding[] {
    const map = new Map<string, Holding>();

    for (const item of items) {
        // 集約キー: Code + Source(文字列)
        // Sourceは単一文字列 ('SBI' or 'Rakuten')
        const key = `${item.code}-${item.source}`;

        const existing = map.get(key);

        if (existing) {
            // 合算ロジック
            const totalQty = existing.quantity + item.quantity;
            const newAvgPrice = totalQty > 0
                ? ((existing.acquisitionPrice * existing.quantity) + (item.acquisitionPrice * item.quantity)) / totalQty
                : 0;

            // Account Type 結合 ("特定" + "NISA" -> "特定, NISA")
            const accounts = new Set(existing.accountType.split(',').map(s => s.trim()));
            accounts.add(item.accountType);
            const mergedAccount = Array.from(accounts).join(', ');

            map.set(key, {
                ...existing,
                quantity: totalQty,
                acquisitionPrice: newAvgPrice,
                totalGainLoss: existing.totalGainLoss + item.totalGainLoss,
                accountType: mergedAccount,
                // Price, Sector, Name等は最新(item)または既存(existing)のどちらかを優先
                // ここでは後勝ち(item)にしておく
                price: item.price || existing.price,
                sector: existing.sector || item.sector,
            });
        } else {
            map.set(key, { ...item });
        }
    }

    return Array.from(map.values());
}

export async function saveHoldingsToSupabase(
    newItems: Holding[],
    currentImportMode: 'SBI' | 'RAKUTEN',
    isAppendMode: boolean
): Promise<{ success: boolean; message: string; userId?: string }> {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return { success: false, message: "セッションが切れました。ログインしてください。" };
        }

        // 0. ソースの厳格な特定
        const targetSource = currentImportMode === 'SBI' ? 'SBI' : 'Rakuten';

        // 1. データの事前集約
        const aggregatedItems = aggregateHoldings(newItems);

        // 2. DB用データ作成
        const dbRows = aggregatedItems.map(item => ({
            user_id: user.id,
            code: item.code,
            name: item.name,
            quantity: item.quantity,
            price: item.price,
            acquisition_price: item.acquisitionPrice,
            total_gain_loss: item.totalGainLoss,
            dividend_per_share: item.dividendPerShare,
            source: targetSource,
            account_type: item.accountType, // e.g. "特定, NISA"
            sector: item.sector,
            updated_at: new Date().toISOString()
        }));

        // Case A: Normal Mode (Not Append) -> 指定ソースの古いデータを削除
        if (!isAppendMode) {
            // currentImportMode に対応する source のデータを削除
            // 例: currentImportMode='SBI' -> source='SBI' のデータを削除
            const targetSource = currentImportMode === 'SBI' ? 'SBI' : 'Rakuten';

            const { error: deleteError } = await supabase
                .from('holdings')
                .delete()
                .eq('user_id', user.id)
                .eq('source', targetSource);

            if (deleteError) {
                console.error("Delete Existing Source Error:", deleteError);
                return { success: false, message: "既存データの更新（削除）に失敗しました" };
            }
        }

        // Case B: Save (Upsert)
        // conflict target: user_id, code, source

        const { error: upsertError } = await supabase
            .from('holdings')
            .upsert(dbRows, { onConflict: 'user_id, code, source' });

        if (upsertError) {
            console.error("Upsert Error:", upsertError);
            return { success: false, message: "データの保存に失敗しました" };
        }

        return { success: true, message: "データを保存しました", userId: user.id };

    } catch (error) {
        console.error("saveHoldingsToSupabase error:", error);
        return { success: false, message: "サーバーエラーが発生しました" };
    }
}

/**
 * ユーザーの全保有データを削除
 */
export async function deleteAllHoldings(): Promise<{ success: boolean; message: string }> {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return { success: false, message: "セッションが切れました。ログインしてください。" };
        }

        const { error } = await supabase
            .from('holdings')
            .delete()
            .eq('user_id', user.id);

        if (error) {
            console.error("Delete All Error:", error);
            return { success: false, message: "削除に失敗しました" };
        }

        return { success: true, message: "全てのデータを削除しました" };
    } catch (error) {
        console.error("deleteAllHoldings error:", error);
        return { success: false, message: "サーバーエラーが発生しました" };
    }
}

/**
 * 指定した銘柄コードの株価のみを更新（部分更新）
 * インポート直後の即時反映などに使用
 */
export async function updateSpecificStockPrices(userId: string, targetCodes: string[]): Promise<UpdateResult> {
    try {
        const supabase = await createClient();

        if (targetCodes.length === 0) {
            return {
                success: true,
                updatedCount: 0,
                pricesFound: 0,
                message: '更新対象の銘柄がありません',
            };
        }

        // 重複排除
        const uniqueCodes = [...new Set(targetCodes.map(c => String(c).trim()))];
        console.log(`[stockActions] Updating specific ${uniqueCodes.length} codes`);

        // Step 1: シート2経由で株価を取得
        // (fetchPricesViaSheet2 内部でバッチ処理されるので大量でもOK)
        const priceMap = await fetchPricesViaSheet2(uniqueCodes);
        const pricesFound = Object.values(priceMap).filter(p => p > 0).length;

        // Step 2: holdingsテーブルを更新
        let updatedCount = 0;

        // コードごとにクエリを発行する
        const { data: holdings, error: fetchError } = await supabase
            .from('holdings')
            .select('id, code')
            .eq('user_id', userId)
            .in('code', uniqueCodes);

        if (fetchError || !holdings) {
            console.error('[stockActions] Failed to fetch holdings:', fetchError);
            return { success: false, updatedCount: 0, pricesFound: 0, message: 'DB参照エラー' };
        }

        for (const holding of holdings) {
            const code = String(holding.code).trim();
            const newPrice = priceMap[code];

            if (newPrice !== undefined && newPrice > 0) {
                const { error: updateError } = await supabase
                    .from('holdings')
                    .update({
                        price: newPrice,
                        updated_at: new Date().toISOString(),
                    })
                    .eq('id', holding.id);

                if (!updateError) updatedCount++;
            }
        }

        return {
            success: true,
            updatedCount,
            pricesFound,
            message: `${updatedCount}件の株価を部分更新しました`,
        };

    } catch (error) {
        console.error('[stockActions] updateSpecificStockPrices error:', error);
        return {
            success: false,
            updatedCount: 0,
            pricesFound: 0,
            message: '部分更新中にエラーが発生しました',
        };
    }
}


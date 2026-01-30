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
        // Step 3: Stocksテーブルを更新
        // updatedCount, failedCount are already declared above.

        // 一括更新用データ作成
        const updates = uniqueCodes.map(code => {
            const newPrice = priceMap[code];
            const priceToSet = (newPrice && newPrice > 0) ? newPrice : 0;

            if (priceToSet > 0) return { code, price: priceToSet, updated_at: new Date().toISOString() };
            return null;
        }).filter(u => u !== null);

        if (updates.length > 0) {
            const { error: updateError } = await supabase
                .from('stocks')
                .upsert(updates as any, { onConflict: 'code' }); // Priceを更新

            if (updateError) {
                console.error(`[stockActions] Failed to update stocks:`, updateError);
            } else {
                updatedCount = updates.length;
            }
        }

        failedCount = uniqueCodes.length - updatedCount;

        // Holdingsのupdated_atも更新すると親切だが、PriceはStocksにあるのでHoldings自体は変更なしとみなすこともできる。
        // リクエスト要件は「Masterの価格が更新されれば両方に反映」。Holdingsテーブル自体の更新は必須ではない。

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
        // Step 3: Stocksテーブルを更新
        let updatedCount = 0;

        const updates = uniqueCodes.map(code => {
            const sector = sectorData[code];
            if (sector) {
                return {
                    code: code,
                    sector: sector.sector,
                    updated_at: new Date().toISOString()
                };
            }
            return null;
        }).filter(Boolean);

        if (updates.length > 0) {
            const { error: updateError } = await supabase
                .from('stocks')
                .upsert(updates as any, { onConflict: 'code' }); // Sectorを更新

            if (!updateError) {
                updatedCount = updates.length;
            } else {
                console.error('[stockActions] Failed to update stocks sector:', updateError);
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
            // 重複を防ぐためにSetを使用
            const accounts = new Set(existing.accountType.split(',').map(s => s.trim()));
            accounts.add(item.accountType);
            const mergedAccount = Array.from(accounts).filter(Boolean).join(', ');

            map.set(key, {
                ...existing,
                quantity: totalQty,
                acquisitionPrice: newAvgPrice,
                totalGainLoss: existing.totalGainLoss + item.totalGainLoss,
                accountType: mergedAccount,
                // Price は最新(item)を優先しつつ、なければ既存
                price: item.price || existing.price,
                // ユーザー入力項目等は既存優先、あるいはマージ
                // existingの値があればそれを維持する（CSVには含まれない情報のため）
                sector: existing.sector || item.sector,
                dividendMonths: existing.dividendMonths || item.dividendMonths,
                fiscalYearMonth: existing.fiscalYearMonth || item.fiscalYearMonth,
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

        let combinedItems: Holding[] = [...newItems];

        // 1. 追加モードの場合、DBから既存データを取得してマージ候補に加える
        if (isAppendMode) {
            // 既存のデータを取得（ソースが一致するもの）
            const { data: existingRows, error: fetchError } = await supabase
                .from('holdings')
                .select('*')
                .eq('user_id', user.id)
                .eq('source', targetSource);

            if (fetchError) {
                console.error("Fetch Existing Error:", fetchError);
                return { success: false, message: "既存データの取得に失敗しました" };
            }

            if (existingRows && existingRows.length > 0) {
                // DBデータをHolding型に変換
                const existingHoldings: Holding[] = existingRows.map(row => ({
                    code: row.code,
                    name: row.name,
                    quantity: row.quantity,
                    price: row.price,
                    dividendPerShare: row.dividend_per_share,
                    sector: row.sector,
                    sector33: '', // DBにはないため空文字
                    acquisitionPrice: row.acquisition_price,
                    totalGainLoss: row.total_gain_loss,
                    source: row.source, // 'SBI' or 'Rakuten'
                    accountType: row.account_type,
                    // 追加情報のマッピング
                    dividendMonths: row.dividend_months,
                    fiscalYearMonth: row.fiscal_year_month,
                    // IR情報
                    ir_rank: row.ir_rank,
                    ir_score: row.ir_score,
                    ir_detail: row.ir_detail,
                    ir_flag: row.ir_flag,
                    ir_date: row.ir_date,
                }));

                // DBデータと新規データを結合
                combinedItems = [...existingHoldings, ...newItems];
            }
        }

        // 1.5 Stocksマスタへの登録（新規コードが存在する場合）
        // 結合されたアイテムからユニークなコードを抽出
        const uniqueCodes = [...new Set(combinedItems.map(item => String(item.code).trim()))];

        if (uniqueCodes.length > 0) {
            // 既存のStocksを確認（または onConflict ignore で一括挿入）
            // "price" と "sector" は初期値 null でも良いが、もしCSVに情報があれば使ってもよい。
            // しかしCSVにはセクターや現在値が含まれていない場合も多い（保有CSVなど）。
            // ここではシンプルに「存在しなければ作成」を行う。

            const stocksToUpsert = uniqueCodes.map(code => ({
                code: code,
                // price, sector は既存があれば維持したいので、onConflict で update しない、
                // あるいは update しても updated_at だけ変えるなど。
                // ここでは「無視」が一番安全だが、Supabaseの upsert(ignoreDuplicates: true) を使う。
            }));

            const { error: stocksError } = await supabase
                .from('stocks')
                .upsert(stocksToUpsert, { onConflict: 'code', ignoreDuplicates: true });

            if (stocksError) {
                console.error("Stocks Master Insert Error:", stocksError);
                // マスタ登録に失敗しても、一旦Holdingsへの保存は試みるか、エラーにするか。
                // FK制約がある場合失敗するので、ここはエラーログを出して続行（FKエラーになればキャッチされる）
            }
        }

        // 2. データの集約（名寄せ）
        // existingItemsとnewItemsで同一銘柄がある場合、ここでマージされる
        const aggregatedItems = aggregateHoldings(combinedItems);

        // 3. DB用データ作成
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
            // マージされたメタデータをDBに保存
            dividend_months: item.dividendMonths,
            fiscal_year_month: item.fiscalYearMonth,
            updated_at: new Date().toISOString()
        }));

        // Case A: Normal Mode (Not Append) -> 指定ソースの古いデータを削除
        if (!isAppendMode) {
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
        // マージ済みのデータを保存する
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
 * 指定ソースのデータのみを削除
 */
export async function deleteHoldingsBySource(source: 'SBI' | 'Rakuten'): Promise<{ success: boolean; message: string }> {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return { success: false, message: "セッションが切れました。ログインしてください。" };
        }

        const { error } = await supabase
            .from('holdings')
            .delete()
            .eq('user_id', user.id)
            .eq('source', source); // ソースでフィルタリング

        if (error) {
            console.error("Delete By Source Error:", error);
            return { success: false, message: `${source}のデータ削除に失敗しました` };
        }

        const sourceLabel = source === 'SBI' ? 'SBI証券' : '楽天証券';
        return { success: true, message: `${sourceLabel}のデータを削除しました` };
    } catch (error) {
        console.error("deleteHoldingsBySource error:", error);
        return { success: false, message: "サーバーエラーが発生しました" };
    }
}

/**
 * 銘柄の配当情報（配当金・配当月）を更新
 * ※ 同じユーザーの同じ銘柄コードの全レコードを更新します
 */
export async function updateHoldingDividend(
    code: string,
    dividendPerShare: number,
    dividendMonths: number[],
    fiscalYearMonth?: number
): Promise<{ success: boolean; message: string }> {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return { success: false, message: "セッションが切れました。ログインしてください。" };
        }

        // 入力チェック
        if (!code) {
            return { success: false, message: "銘柄コードが不明です" };
        }

        // DB更新
        // 同じ銘柄コードを持つ全ての保有レコードを更新する
        const { error } = await supabase
            .from('holdings')
            .update({
                dividend_per_share: dividendPerShare,
                dividend_months: dividendMonths,
                fiscal_year_month: fiscalYearMonth,
                updated_at: new Date().toISOString()
            })
            .eq('user_id', user.id)
            .eq('code', code);

        if (error) {
            console.error("Update Holding Dividend Error:", error);
            console.error("Error Details:", error.message, error.details, error.hint);
            return { success: false, message: `配当情報の更新に失敗しました: ${error.message}` };
        }

        return { success: true, message: "配当情報を保存しました" };
    } catch (error: any) {
        console.error("updateHoldingDividend error:", error);
        return { success: false, message: `サーバーエラーが発生しました: ${error?.message || 'Unknown error'}` };
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

        // Step 2: Stocksテーブルを更新
        let updatedCount = 0;

        const updates = uniqueCodes.map(code => {
            const newPrice = priceMap[code];
            if (newPrice !== undefined && newPrice > 0) {
                return {
                    code: code,
                    price: newPrice,
                    updated_at: new Date().toISOString(),
                };
            }
            return null;
        }).filter(Boolean);

        if (updates.length > 0) {
            const { error: updateError } = await supabase
                .from('stocks')
                .upsert(updates as any, { onConflict: 'code' });

            if (!updateError) {
                updatedCount = updates.length;
            } else {
                console.error('[stockActions] Failed to update specific stocks:', updateError);
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

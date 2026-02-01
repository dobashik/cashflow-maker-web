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
    lookupMasterDataBatch,
    PriceMap,
    MasterDataMap
} from '@/lib/googleSheets';
import { createClient } from '@/utils/supabase/server';
import { createServiceRoleClient } from '@/utils/supabase/service-role';



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
/**
 * 全銘柄の株価を一括更新（手動更新ボタン用）
 * 
 * 修正: 負荷軽減のため、スプレッドシートへのアクセスを廃止。
 * データベース（stocksテーブル）はCronジョブによって定期的に更新されるため、
 * ここでは画面の再検証（revalidatePath）のみ行い、ユーザーには最新データを表示します。
 */
export async function updateAllStockPrices(userId: string): Promise<UpdateResult> {
    try {
        // サーバーサイドキャッシュのクリア（画面更新）
        const { revalidatePath } = await import('next/cache');
        revalidatePath('/', 'layout');

        console.log('[stockActions] Manual update requested. Triggered revalidatePath.');

        return {
            success: true,
            updatedCount: 0,
            pricesFound: 0,
            message: '最新データを表示しました（株価はサーバーが自動更新しています）',
        };
    } catch (error) {
        console.error('[stockActions] updateAllStockPrices error:', error);
        return {
            success: false,
            updatedCount: 0,
            pricesFound: 0,
            message: '更新処理中にエラーが発生しました',
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

        // Step 1: stocks テーブルから sector が未設定の銘柄コードを取得
        // holdingsではなくstocksを正とする
        const { data: stocks, error: fetchError } = await supabase
            .from('stocks')
            .select('code, sector')
            .or('sector.is.null,sector.eq.,sector.eq.その他');

        if (fetchError) {
            console.error('[stockActions] Failed to fetch stocks:', fetchError);
            return {
                success: false,
                updatedCount: 0,
                message: 'データの取得に失敗しました',
            };
        }

        if (!stocks || stocks.length === 0) {
            return {
                success: true,
                updatedCount: 0,
                message: 'セクター情報は既に最新です',
            };
        }

        // 重複排除した銘柄コードリスト
        const uniqueCodes = [...new Set(stocks.map(h => String(h.code).trim()))];

        // Step 2: マスタデータからセクター情報を取得
        const sectorData = await enrichHoldingsWithSectorData(uniqueCodes);

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
                    id: row.id,
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
            // Step A: 既にDBに存在する銘柄を確認（負荷軽減＆既存セクター保護のため）
            // RLS回避のためAdminクライアントを使用
            const adminSupabase = createServiceRoleClient();
            const { data: existingStocks, error: checkError } = await adminSupabase
                .from('stocks')
                .select('code')
                .in('code', uniqueCodes);

            if (checkError) {
                console.error("Stocks Check Error:", checkError);
                // エラー時は安全のため処理続行（マスタ更新スキップ）または停止。
                // ここではログを出して、マスタ更新はスキップする（Holdings保存は継続）
            } else {
                const existingCodeSet = new Set(existingStocks?.map(s => s.code) || []);

                // Step B: DBに存在しない「完全新規銘柄」のみを抽出
                const newCodes = uniqueCodes.filter(c => !existingCodeSet.has(c));

                if (newCodes.length > 0) {
                    console.log(`[stockActions] Found ${newCodes.length} NEW stocks. Fetching master data...`);

                    // Step C: 新規銘柄のみマスタデータを取得（CSVパース）
                    // 既存銘柄のセクター情報は上書きしない
                    const masterDataMap = await lookupMasterDataBatch(newCodes);

                    const stocksToInsert = newCodes.map(code => {
                        const master = masterDataMap[code];
                        return {
                            code: code,
                            name: master?.name || null, // 名前もマスタから補完
                            sector: master?.sector || null, // セクターもマスタから補完
                            // priceはここではないのでnull/0（別途cron等で更新）
                            updated_at: new Date().toISOString()
                        };
                    });

                    // Step D: 新規登録（Adminクライアント使用）
                    const { error: insertError } = await adminSupabase
                        .from('stocks')
                        .insert(stocksToInsert); // 既にフィルタリング済みなので insert でOKだが、念のため

                    if (insertError) {
                        console.error("New Stocks Insert Error (Trying upsert ignore):", insertError);

                        // Recovery: Upsert with ignoreDuplicates
                        const { error: recoveryError } = await adminSupabase
                            .from('stocks')
                            .upsert(stocksToInsert, { onConflict: 'code', ignoreDuplicates: true });

                        if (recoveryError) {
                            console.error("Recovery Stocks Upsert Error:", recoveryError);
                            return {
                                success: false,
                                message: `マスタデータの登録に失敗しました: ${recoveryError.message || JSON.stringify(recoveryError)}`
                            };
                        }
                    } else {
                        console.log(`[stockActions] Registered ${stocksToInsert.length} new stocks with sector info.`);
                    }
                }
            }
        }

        // 2. データの集約（名寄せ）
        // existingItemsとnewItemsで同一銘柄がある場合、ここでマージされる
        const aggregatedItems = aggregateHoldings(combinedItems);

        // 3. DB用データ作成
        const dbRows = aggregatedItems.map(item => ({
            id: item.id || generateUUID(), // IDがあれば設定（更新用）、なければ新規生成（Insert用）
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
        // conflict target: removed to use Primary Key (id) for updates
        // IDがある行はUpdate、ない行はInsertになる
        const { error: upsertError } = await supabase
            .from('holdings')
            .upsert(dbRows);

        if (upsertError) {
            console.error("Upsert Error:", upsertError);
            return { success: false, message: `データの保存に失敗しました: ${upsertError.message || JSON.stringify(upsertError)}` };
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
/**
 * 指定した銘柄コードの株価のみを更新（部分更新）
 * 
 * 修正: 「新規銘柄」のみを対象に外部取得を行い、既存銘柄はDBの値をそのまま使用する。
 * これにより、既存ユーザーのインポート時のAPI負荷をゼロにする。
 */
export async function updateSpecificStockPrices(userId: string, targetCodes: string[]): Promise<UpdateResult> {
    try {
        const supabase = await createClient();
        const adminSupabase = createServiceRoleClient(); // Stocksテーブル操作用

        if (targetCodes.length === 0) {
            return {
                success: true,
                updatedCount: 0,
                pricesFound: 0,
                message: '更新対象の銘柄がありません',
            };
        }

        // リクエストされたコードの正規化と重複排除
        const requestedCodes = [...new Set(targetCodes.map(c => String(c).trim()))];
        console.log(`[stockActions] Request to update ${requestedCodes.length} codes`);

        // Step 1: 既にstocksテーブルに存在する銘柄を確認
        // API負荷削減のため、既存銘柄は外部取得・更新を行わない
        // RLS回避のためAdminクライアントを使用
        const { data: existingStocks, error: checkError } = await adminSupabase
            .from('stocks')
            .select('code')
            .in('code', requestedCodes);

        if (checkError) {
            console.error('[stockActions] Failed to check existing stocks:', checkError);
            // 安全のため、全件対象として続行するか、エラーにするか。ここではログ出して全件トライ（またはエラー）
            // エラーを返すとインポートフローが止まる可能性があるので、既存チェック失敗時は空リスト扱い（=全件新規扱い）にする手もあるが、
            // 安全側に倒して「取得失敗扱い」にするか、そのまま続行するか。
            // ここでは続行するが、existingStocksを空と仮定すると全件フェッチしてしまい負荷対策にならない。
            // なのでエラーリターンする。
            return {
                success: false,
                updatedCount: 0,
                pricesFound: 0,
                message: '既存データ確認中にエラーが発生しました',
            };
        }

        const existingCodeSet = new Set(existingStocks?.map(s => s.code) || []);

        // Step 2: 完全に新規の銘柄だけを特定
        const newCodes = requestedCodes.filter(c => !existingCodeSet.has(c));
        console.log(`[stockActions] Found ${newCodes.length} NEW stocks to fetch (Skipped ${existingCodeSet.size} existing)`);

        if (newCodes.length === 0) {
            return {
                success: true,
                updatedCount: 0,
                pricesFound: existingCodeSet.size, // 既存データがあるので「見つかった」とみなすこともできるが、更新数は0
                message: '全ての銘柄データは取得済みです（外部アクセスなし）',
            };
        }

        // Step 3: 新規銘柄のみシート2経由で株価を取得
        const priceMap = await fetchPricesViaSheet2(newCodes);
        const pricesFound = Object.values(priceMap).filter(p => p > 0).length;

        // Step 4: Stocksテーブルに新規保存
        let updatedCount = 0;

        const updates = newCodes.map(code => {
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
            // RLS回避のためAdminクライアントを使用
            const { error: updateError } = await adminSupabase
                .from('stocks')
                .upsert(updates as any, { onConflict: 'code' });

            if (!updateError) {
                updatedCount = updates.length;
            } else {
                console.error('[stockActions] Failed to save new stocks:', updateError);
            }
        }

        return {
            success: true,
            updatedCount,
            pricesFound: pricesFound + existingCodeSet.size, // 新規取得分 + 既存分
            message: `${updatedCount}件の新規銘柄データを取得しました`,
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

/**
 * Cronジョブ用: マスターデータの自動更新機能
 * 
 * @param mode 'full' | 'retry'
 * - full: 全銘柄を更新
 * - retry: 最終更新から一定時間経過しても更新されていない（=失敗した）銘柄のみ更新（例: 25分以上前）
 */
export async function updateMasterStockPrices(mode: 'full' | 'retry' = 'full'): Promise<UpdateResult> {
    try {
        console.log(`[stockActions] Starting master update in ${mode} mode`);
        const supabase = createServiceRoleClient(); // Admin権限で操作

        // 1. 対象銘柄の抽出
        // フォールバック判定のために price も取得する
        let query = supabase.from('stocks').select('code, updated_at, price');

        if (mode === 'retry') {
            // 現在時刻より25分以上前のレコードを「更新失敗」または「未更新」とみなす
            // Cronは30分おきなので、25分前=前回の回で更新されなかったもの
            const threshold = new Date(Date.now() - 25 * 60 * 1000).toISOString();
            query = query.lt('updated_at', threshold);
        }

        const { data: stocks, error: fetchError } = await query;

        if (fetchError) {
            console.error('[stockActions] fetch stocks error:', fetchError);
            return { success: false, updatedCount: 0, pricesFound: 0, message: fetchError.message };
        }

        if (!stocks || stocks.length === 0) {
            console.log('[stockActions] No stocks to update');
            return { success: true, updatedCount: 0, pricesFound: 0, message: '更新対象なし' };
        }

        const codes = stocks.map(s => s.code);
        console.log(`[stockActions] Updating ${codes.length} codes`);

        // 2. Google Sheets から価格取得
        const priceMap = await fetchPricesViaSheet2(codes);
        const pricesFound = Object.values(priceMap).filter(p => p > 0).length;

        // 3. Stocksテーブル更新
        // Upsert用のデータ作成
        const updates = codes.map(code => {
            const newPrice = priceMap[code];
            const currentStock = stocks.find(s => s.code === code);

            // Case A: 新しい価格が有効なら更新
            if (newPrice !== undefined && newPrice > 0) {
                return {
                    code: code,
                    price: newPrice,
                    updated_at: new Date().toISOString(),
                };
            }

            // Case B: 取得失敗時、DBに「1時間以内の有効なデータ」があれば更新をスキップ（古い値を維持）
            if (currentStock && currentStock.price > 0 && currentStock.updated_at) {
                const lastUpdate = new Date(currentStock.updated_at).getTime();
                const oneHourAgo = Date.now() - (60 * 60 * 1000);

                if (lastUpdate > oneHourAgo) {
                    console.log(`[stockActions] Skip update for ${code}: Fetch failed but DB has fresh data (within 1h).`);
                    return null;
                }
            }

            // Case C: 取得失敗 かつ DBも古い/無効 -> スキップ（次回リトライ対象になる可能性あり）
            return null;
        }).filter(Boolean);

        if (updates.length > 0) {
            const { error: updateError } = await supabase
                .from('stocks')
                .upsert(updates as any, { onConflict: 'code' });

            if (updateError) {
                console.error('[stockActions] Update Error:', updateError);
                return { success: false, updatedCount: 0, pricesFound, message: 'DB更新失敗' };
            }

            console.log(`[stockActions] Successfully updated ${updates.length} stocks`);
            return { success: true, updatedCount: updates.length, pricesFound, message: `Updated ${updates.length} stocks` };
        }

        return { success: true, updatedCount: 0, pricesFound, message: '有効な価格が見つかりませんでした' };

    } catch (e: any) {
        console.error('[stockActions] updateMasterStockPrices critical error:', e);
        return { success: false, updatedCount: 0, pricesFound: 0, message: e.message || 'Unknown Error' };
    }
}

/**
 * Helper to generate UUID safely in both Node.js and Edge Runtimes
 */
function generateUUID() {
    // Edge Runtime / Modern Browsers / Node 19+
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    // Fallback for environments where crypto.randomUUID is not available
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

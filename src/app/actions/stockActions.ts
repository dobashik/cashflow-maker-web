'use server';

/**
 * 保有銘柄データの管理アクション
 *
 * 株価は証券会社CSV（SBI/楽天）のインポート時に取り込んだ値（holdings.price）を
 * 正として扱う。外部サービスからの株価自動取得は行わない。
 */

import {
    fetchMasterData,
    lookupMasterDataBatch,
    MasterDataMap
} from '@/lib/stockMaster';
import { createClient } from '@/utils/supabase/server';
import { createServiceRoleClient } from '@/utils/supabase/service-role';

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

export type SectorStock = {
    code: string;
    name: string;
    sector: string;
};

export type PortfolioHistory = {
    id: string;
    source: 'SBI' | 'Rakuten';
    sources: Array<'SBI' | 'Rakuten'>;
    importMode: 'replace' | 'append';
    holdings: Holding[];
    itemCount: number;
    totalValue: number;
    fileNames: string[];
    dataDate: string;
    createdAt: string;
    updatedAt: string;
    isOpen: boolean;
};

/**
 * 17業種区分に属する全銘柄をローカルの銘柄マスターから取得する。
 * 銘柄マスター全体をブラウザへ公開せず、選択された業種だけを返す。
 */
export async function getStocksBySector(sector: string): Promise<{
    success: boolean;
    stocks: SectorStock[];
    message?: string;
}> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return { success: false, stocks: [], message: 'ログインが必要です' };
    }

    const masterData = await fetchMasterData();
    const stocks = Object.entries(masterData)
        .filter(([, item]) => item.sector === sector)
        .map(([code, item]) => ({
            code,
            name: item.name,
            sector: item.sector,
        }))
        .sort((a, b) => a.code.localeCompare(b.code, 'ja', { numeric: true }));

    return { success: true, stocks };
}

/**
 * 全銘柄のセクター情報を一括更新
 * ※ sector が null または空文字列のレコードのみを更新対象とする（効率化）
 */
export async function updateAllSectorData(userId: string): Promise<{ success: boolean; updatedCount: number; message: string }> {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || user.id !== userId) {
            return {
                success: false,
                updatedCount: 0,
                message: '認証情報を確認できませんでした',
            };
        }

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
            // stocks は全ユーザー共通のマスタ。RLSでは authenticated に書き込みを許可していないため、
            // 認証済みユーザーからの操作でも service_role 経由で更新する。
            const adminSupabase = createServiceRoleClient();
            const { error: updateError } = await adminSupabase
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
    isAppendMode: boolean,
    fileNames: string[] = [],
    dataDate?: string,
    activeHistoryId?: string
): Promise<{ success: boolean; message: string; userId?: string; historySaved?: boolean; historyId?: string }> {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return { success: false, message: "セッションが切れました。ログインしてください。" };
        }

        // 0. ソースの厳格な特定
        const targetSource = currentImportMode === 'SBI' ? 'SBI' : 'Rakuten';

        type ActiveHistoryRow = {
            id: string;
            holdings_data: Holding[];
            file_names: string[];
            sources: string[];
            source: 'SBI' | 'Rakuten';
            data_date: string;
            is_open: boolean;
        };
        let activeHistory: ActiveHistoryRow | null = null;

        if (isAppendMode) {
            if (!activeHistoryId) {
                return { success: false, message: '追加先の更新履歴が見つかりません。新しい更新として取り込んでください。' };
            }

            const { data: historyRow, error: activeHistoryError } = await supabase
                .from('portfolio_history')
                .select('id, holdings_data, file_names, sources, source, data_date, is_open')
                .eq('id', activeHistoryId)
                .eq('user_id', user.id)
                .eq('is_open', true)
                .maybeSingle();

            if (activeHistoryError || !historyRow) {
                return { success: false, message: '追加先の更新履歴を確認できません。新しい更新として取り込んでください。' };
            }

            activeHistory = historyRow as ActiveHistoryRow;
        }

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
                            // name: master?.name || null, // Stocksテーブルにname列がない可能性があるため除外
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

        // 保存対象ソースの既存行を一度入れ替える。
        // 追加モードでは同一証券会社の既存データを combinedItems に取り込んで
        // 集約済みなので、ここで入れ替えることで過去の重複行も確実に解消できる。
        // 通常モードはポートフォリオ全体を入れ替える。
        if (!isAppendMode) {
            const { error: deleteError } = await supabase
                .from('holdings')
                .delete()
                .eq('user_id', user.id);

            if (deleteError) {
                console.error("Delete Existing Source Error:", deleteError);
                return { success: false, message: "既存データの更新（削除）に失敗しました" };
            }
        } else {
            const { error: deleteError } = await supabase
                .from('holdings')
                .delete()
                .eq('user_id', user.id)
                .eq('source', targetSource);

            if (deleteError) {
                console.error("Delete Existing Source Error:", deleteError);
                return { success: false, message: "既存データの更新（重複整理）に失敗しました" };
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

        // 履歴にはDB全体ではなく、この操作で選択されたCSVの内容だけを固定保存する。
        // 後続のインポートで現在のポートフォリオが変わっても、この配列は変化しない。
        let historySaved = false;
        let savedHistoryId: string | undefined;
        const importedHoldings = newItems.map(item => ({
            ...item,
            code: String(item.code).trim(),
        }));
        const historyHoldings = activeHistory
            ? aggregateHoldings([
                ...(Array.isArray(activeHistory.holdings_data) ? activeHistory.holdings_data : []),
                ...importedHoldings,
            ])
            : importedHoldings;
        const historyTotalValue = historyHoldings.reduce(
            (sum, holding) => sum + holding.price * holding.quantity,
            0
        );

        const mergedFileNames = activeHistory
            ? [...(activeHistory.file_names || []), ...fileNames]
            : fileNames;
        const mergedSources = Array.from(new Set([
            ...(activeHistory?.sources?.length ? activeHistory.sources : activeHistory ? [activeHistory.source] : []),
            targetSource,
        ]));
        const incomingDataDate = dataDate || new Date().toISOString();
        const mergedDataDate = activeHistory && new Date(activeHistory.data_date) > new Date(incomingDataDate)
            ? activeHistory.data_date
            : incomingDataDate;
        const historyPayload = {
            holdings_data: historyHoldings,
            item_count: new Set(historyHoldings.map(holding => String(holding.code).trim()).filter(Boolean)).size,
            total_value: historyTotalValue,
            file_names: mergedFileNames,
            sources: mergedSources,
            data_date: mergedDataDate,
            updated_at: new Date().toISOString(),
        };

        if (activeHistory) {
            const { data: updatedHistory, error: historyError } = await supabase
                .from('portfolio_history')
                .update(historyPayload)
                .eq('id', activeHistory.id)
                .eq('user_id', user.id)
                .select('id')
                .single();

            if (historyError) {
                console.error('Portfolio History Update Error:', historyError);
            } else {
                historySaved = true;
                savedHistoryId = updatedHistory.id;
            }
        } else {
            const { error: closeHistoryError } = await supabase
                .from('portfolio_history')
                .update({ is_open: false, updated_at: new Date().toISOString() })
                .eq('user_id', user.id)
                .eq('is_open', true);

            if (closeHistoryError) {
                console.error('Portfolio History Close Error:', closeHistoryError);
                return { success: false, message: '以前の更新履歴を確定できませんでした' };
            }

            const { data: insertedHistory, error: historyError } = await supabase
                .from('portfolio_history')
                .insert({
                    user_id: user.id,
                    source: targetSource,
                    import_mode: 'replace',
                    is_open: true,
                    ...historyPayload,
                })
                .select('id')
                .single();

            if (historyError) {
                console.error('Portfolio History Insert Error:', historyError);
            } else {
                historySaved = true;
                savedHistoryId = insertedHistory.id;
            }
        }

        return {
            success: true,
            message: historySaved
                ? 'データと履歴を保存しました'
                : 'データを保存しました（履歴テーブルの設定後、履歴保存が有効になります）',
            userId: user.id,
            historySaved,
            historyId: savedHistoryId,
        };

    } catch (error) {
        console.error("saveHoldingsToSupabase error:", error);
        return { success: false, message: "サーバーエラーが発生しました" };
    }
}

export async function getPortfolioHistory(): Promise<{
    success: boolean;
    history: PortfolioHistory[];
    message?: string;
}> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return { success: false, history: [], message: 'ログインが必要です' };
    }

    const { data, error } = await supabase
        .from('portfolio_history')
        .select('id, source, sources, import_mode, holdings_data, item_count, total_value, file_names, data_date, created_at, updated_at, is_open')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Portfolio History Fetch Error:', error);
        return { success: false, history: [], message: '履歴の取得に失敗しました' };
    }

    return {
        success: true,
        history: (data || []).map(row => ({
            id: row.id,
            source: row.source as 'SBI' | 'Rakuten',
            sources: Array.isArray(row.sources) && row.sources.length > 0
                ? row.sources as Array<'SBI' | 'Rakuten'>
                : [row.source as 'SBI' | 'Rakuten'],
            importMode: row.import_mode as 'replace' | 'append',
            holdings: Array.isArray(row.holdings_data) ? row.holdings_data as Holding[] : [],
            itemCount: Number(row.item_count),
            totalValue: Number(row.total_value),
            fileNames: Array.isArray(row.file_names) ? row.file_names : [],
            dataDate: row.data_date || row.created_at,
            createdAt: row.created_at,
            updatedAt: row.updated_at || row.created_at,
            isOpen: Boolean(row.is_open),
        })),
    };
}

export async function deletePortfolioHistory(historyId: string): Promise<{
    success: boolean;
    message: string;
}> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return { success: false, message: 'ログインが必要です' };
    }

    const { error } = await supabase
        .from('portfolio_history')
        .delete()
        .eq('id', historyId)
        .eq('user_id', user.id);

    if (error) {
        console.error('Portfolio History Delete Error:', error);
        return { success: false, message: '履歴の削除に失敗しました' };
    }

    return { success: true, message: '履歴を削除しました' };
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

        const { error: closeHistoryError } = await supabase
            .from('portfolio_history')
            .update({ is_open: false, updated_at: new Date().toISOString() })
            .eq('user_id', user.id)
            .eq('is_open', true);

        if (closeHistoryError) {
            console.error('Close History Error:', closeHistoryError);
            return { success: false, message: '保有データは削除しましたが、更新履歴の確定に失敗しました' };
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

        const { error: closeHistoryError } = await supabase
            .from('portfolio_history')
            .update({ is_open: false, updated_at: new Date().toISOString() })
            .eq('user_id', user.id)
            .eq('is_open', true);

        if (closeHistoryError) {
            console.error('Close History Error:', closeHistoryError);
            return { success: false, message: `${source}のデータは削除しましたが、更新履歴の確定に失敗しました` };
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

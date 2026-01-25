
import { TrendingUp, MoreHorizontal, FileDown, RefreshCcw, AlertTriangle, UploadCloud, Trash2 } from 'lucide-react';
import { HOLDINGS, Holding } from '@/lib/mockData';
import { motion, AnimatePresence, Variants } from 'framer-motion';
import { useState, useRef, useEffect, useCallback } from 'react';
import { parseRakutenCSV, parseSBICSV, parseAnalysisCSV, loadCSV } from '@/utils/csvParser';
import { createClient } from '@/utils/supabase/client';
import { updateAllStockPrices, updateAllSectorData, updateHoldingAnalysisData, saveHoldingsToSupabase, deleteAllHoldings, updateSpecificStockPrices } from '@/app/actions/stockActions';

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";

// Helper for Rank Colors
const getRankColor = (rank: string) => {
    const r = rank?.toUpperCase();
    if (r === 'S') return 'bg-yellow-100 text-yellow-700 ring-yellow-600/20';
    if (r === 'A') return 'bg-emerald-100 text-emerald-700 ring-emerald-600/20';
    if (r === 'B') return 'bg-blue-100 text-blue-700 ring-blue-600/20';
    if (r === 'C') return 'bg-slate-100 text-slate-700 ring-slate-600/20';
    if (r === 'D') return 'bg-rose-100 text-rose-700 ring-rose-600/20';
    return 'bg-slate-50 text-slate-500';
};

export function HoldingsTable({ isSampleMode = false, onDataUpdate }: { isSampleMode?: boolean, onDataUpdate?: (data: Holding[]) => void }) {
    const [holdings, setHoldings] = useState<Holding[]>(() => {
        if (isSampleMode) return HOLDINGS;
        return [];
    });

    // Share data with parent
    useEffect(() => {
        if (onDataUpdate) {
            onDataUpdate(holdings);
        }
    }, [holdings, onDataUpdate]);

    const supabase = createClient();

    // Fetch and Aggregate Data from Supabase
    const fetchHoldings = useCallback(async () => {
        if (isSampleMode) return;

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return; // Not logged in

        const { data, error } = await supabase
            .from('holdings')
            .select('*')
            .eq('user_id', user.id);

        if (error) {
            console.error('Error fetching holdings:', error);
            return;
        }

        if (data) {
            // Aggregation Logic (Client-side merge)
            const mergedMap = new Map<string, Holding>();

            data.forEach((row: any) => {
                // Determine source as array for processing
                const rowSource = Array.isArray(row.source) ? row.source : (row.source ? [row.source] : []);

                const item: any = {
                    code: row.code,
                    name: row.name,
                    quantity: Number(row.quantity),
                    price: Number(row.price),
                    acquisitionPrice: Number(row.acquisition_price),
                    totalGainLoss: Number(row.total_gain_loss),
                    dividendPerShare: Number(row.dividend_per_share),
                    source: rowSource,
                    accountType: row.account_type || '特定',
                    sector: row.sector || '',
                    sector33: row.sector_33 || '',
                    ir_rank: row.ir_rank,
                    ir_score: row.ir_score,
                    ir_detail: row.ir_detail,
                    ir_flag: row.ir_flag,
                    ir_date: row.ir_date,
                };

                const existing = mergedMap.get(item.code);

                if (existing) {
                    // Weighted Average & Sum
                    const totalQty = existing.quantity + item.quantity;
                    const newAvgPrice = totalQty > 0
                        ? ((existing.acquisitionPrice * existing.quantity) + (item.acquisitionPrice * item.quantity)) / totalQty
                        : 0;

                    // Merge Metadata
                    // existing.source is string (e.g. "SBI, Rakuten"), split back to array for merging
                    const existingSources = typeof existing.source === 'string' ? existing.source.split(', ') : [existing.source];
                    const mergedSource = Array.from(new Set([...existingSources, ...item.source]));
                    const mergedAccount = existing.accountType !== item.accountType ? 'Mixed' : existing.accountType;

                    mergedMap.set(item.code, {
                        ...existing,
                        quantity: totalQty,
                        acquisitionPrice: newAvgPrice,
                        price: item.price,
                        totalGainLoss: existing.totalGainLoss + item.totalGainLoss,
                        source: Array.isArray(mergedSource) ? mergedSource.join(', ') : mergedSource,
                        accountType: Array.isArray(mergedAccount) ? mergedAccount.join(', ') : mergedAccount,
                        sector: existing.sector || item.sector,
                        sector33: existing.sector33 || item.sector33,
                        ir_rank: existing.ir_rank || item.ir_rank,
                        ir_score: existing.ir_score || item.ir_score,
                        ir_detail: existing.ir_detail || item.ir_detail,
                        ir_flag: existing.ir_flag || item.ir_flag,
                        ir_date: existing.ir_date || item.ir_date,
                    });
                } else {
                    mergedMap.set(item.code, {
                        ...item,
                        source: Array.isArray(item.source) ? item.source.join(', ') : item.source
                    });
                }
            });

            setHoldings(Array.from(mergedMap.values()));
            return user.id;
        }
        return null;
    }, [isSampleMode]);

    // Initial Load + Auto Price Update on Login
    useEffect(() => {
        if (isSampleMode) return;

        const initializeHoldings = async () => {
            const userId = await fetchHoldings();

            // Auto-update on first load of this session (if not already done)
            if (userId) {
                const sessionKey = `holdings_auto_updated_${userId}`;
                const alreadyUpdated = sessionStorage.getItem(sessionKey);

                if (!alreadyUpdated) {
                    console.log('[HoldingsTable] Auto-updating stock prices on login...');
                    setIsUpdating(true);
                    try {
                        const sectorResult = await updateAllSectorData(userId);
                        const priceResult = await updateAllStockPrices(userId);
                        await fetchHoldings();
                        sessionStorage.setItem(sessionKey, 'true');
                    } catch (error) {
                        console.error('[HoldingsTable] Auto-update error:', error);
                    } finally {
                        setIsUpdating(false);
                    }
                }
            }
        };

        initializeHoldings();
    }, [isSampleMode, fetchHoldings]);

    // 4. Other Hooks
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [importMode, setImportMode] = useState<'SBI' | 'RAKUTEN' | 'ANALYSIS' | null>(null);
    const [isDragOver, setIsDragOver] = useState(false);
    const [isUpdating, setIsUpdating] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isAppendMode, setIsAppendMode] = useState(false);

    // 5. Animation Variants
    const container = {
        hidden: { opacity: 0 },
        show: {
            opacity: 1,
            transition: { staggerChildren: 0.05 }
        }
    };

    const itemVariant: Variants = {
        hidden: { x: -20, opacity: 0 },
        show: (i: number) => ({
            x: 0,
            opacity: 1,
            transition: {
                delay: i * 0.05,
                type: "spring" as const,
                stiffness: 300,
                damping: 24
            }
        })
    };

    const handleImportClick = (mode: 'SBI' | 'RAKUTEN' | 'ANALYSIS') => {
        if (isSampleMode) {
            alert("インポート機能を利用するにはログインしてください");
            return;
        }
        setImportMode(mode);
    };

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);
    }, []);

    const handleDrop = useCallback(async (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);
        const file = e.dataTransfer.files?.[0];
        if (file && importMode) {
            await processFile(file, importMode);
        }
    }, [importMode, isAppendMode]);

    // 手動株価更新ハンドラー
    const handleUpdatePrices = async () => {
        if (isSampleMode) {
            alert("この機能を利用するにはログインしてください");
            return;
        }

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            alert("セッションが切れました。ログインしてください。");
            return;
        }

        setIsUpdating(true);
        try {
            // Step 1: セクター情報を更新
            const sectorResult = await updateAllSectorData(user.id);
            console.log('[HoldingsTable] Sector update:', sectorResult.message);

            // Step 2: 最新株価を取得・更新
            const priceResult = await updateAllStockPrices(user.id);
            console.log('[HoldingsTable] Price update:', priceResult.message);

            // Refresh UI
            await fetchHoldings();
            alert(`${sectorResult.message}\n${priceResult.message}`);
        } catch (error) {
            console.error('[HoldingsTable] Update error:', error);
            alert('更新中にエラーが発生しました');
        } finally {
            setIsUpdating(false);
        }
    };

    const handleDeleteAll = async () => {
        if (isSampleMode) return;
        if (!confirm("本当に全てのデータを削除しますか？\nこの操作は取り消せません。")) return;

        setIsLoading(true);
        try {
            const result = await deleteAllHoldings();
            alert(result.message);
            if (result.success) {
                await fetchHoldings();
            }
        } catch (error) {
            console.error("Delete All Error:", error);
            alert("削除中にエラーが発生しました");
        } finally {
            setIsLoading(false);
        }
    };




    const processFile = async (file: File, mode: 'SBI' | 'RAKUTEN' | 'ANALYSIS') => {
        // 即座にモーダルを閉じてローディング開始
        setImportMode(null);
        setIsLoading(true);

        try {
            const content = await loadCSV(file);

            if (mode === 'ANALYSIS') {
                const analysisData = parseAnalysisCSV(content);
                console.log("【Import】パース件数:", analysisData.length);
                if (analysisData.length > 0) {
                    console.log("【Import】先頭データ:", analysisData[0]);

                    const updateItems = analysisData.map(d => ({
                        code: d.code!,
                        ir_rank: d.ir_rank || '',
                        ir_score: d.ir_score || 0,
                        ir_detail: d.ir_detail || '',
                        ir_flag: d.ir_flag || '',
                        ir_date: d.ir_date || ''
                    }));

                    const result = await updateHoldingAnalysisData(updateItems);
                    alert(result.message);
                } else {
                    alert("有効な分析データが見つかりませんでした");
                }
                return;
            }

            // Normal Holding CSV (SBI/Rakuten)
            let newHoldings: Holding[] = [];
            if (mode === 'SBI') {
                newHoldings = parseSBICSV(content);
            } else if (mode === 'RAKUTEN') {
                newHoldings = parseRakutenCSV(content);
            }

            console.log("【Import】パース件数:", newHoldings.length);

            if (newHoldings.length > 0) {
                console.log("【Import】先頭データ:", newHoldings[0]);
                const result = await saveHoldingsToSupabase(newHoldings, mode, isAppendMode);

                if (!result.success) {
                    alert(result.message);
                    return;
                }
                const userId = result.userId;

                // Auto-update
                if (userId) {
                    setIsUpdating(true); // For the button indicator consistency

                    try {
                        const sectorResult = await updateAllSectorData(userId);
                        // 部分更新に変更: 今回インポートしたコードのみを対象にする
                        const targetCodes = newHoldings.map(h => h.code);
                        const priceResult = await updateSpecificStockPrices(userId, targetCodes);
                        alert(`インポート完了！\n${sectorResult.message}\n${priceResult.message}`);
                    } catch (updateError) {
                        console.error('[HoldingsTable] Auto-update error:', updateError);
                        alert('インポートは完了しましたが、株価更新中にエラーが発生しました');
                    } finally {
                        setIsUpdating(false);
                    }
                }
            } else {
                alert("読み込み可能なデータが見つかりませんでした");
            }
        } catch (error) {
            console.error("Import Error:", error);
            alert("ファイルの読み込みに失敗しました");
        } finally {
            console.log("【Import】データをリフレッシュします");
            await fetchHoldings();
            setIsLoading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file && importMode) {
            processFile(file, importMode);
        }
    };

    return (
        <div className="bg-white rounded-3xl p-6 shadow-xl border border-indigo-50 overflow-hidden flex flex-col h-[650px]">
            <div className="flex items-center justify-between mb-2 flex-shrink-0">
                <h3 className="text-xl font-bold text-indigo-900 flex items-center gap-2">
                    保有株式リスト
                </h3>

                <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    accept=".csv"
                    onChange={handleFileChange}
                />

                <div className="flex items-center gap-3">
                    {/* 独立した株価更新ボタン */}
                    <button
                        onClick={handleUpdatePrices}
                        disabled={isUpdating || isSampleMode}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${isUpdating || isSampleMode
                            ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                            : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'
                            }`}
                    >
                        <RefreshCcw className={`w-4 h-4 ${isUpdating ? 'animate-spin' : ''}`} />
                        {isUpdating ? '更新中...' : '株価更新'}
                    </button>

                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button className="text-slate-400 hover:text-indigo-600 outline-none">
                                <MoreHorizontal />
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-white rounded-xl shadow-xl border border-slate-100 p-2 min-w-[200px]">
                            <DropdownMenuItem
                                className="flex items-center gap-2 p-2 hover:bg-indigo-50 rounded-lg cursor-pointer text-slate-600 hover:text-indigo-900"
                                onClick={() => handleImportClick('SBI')}
                            >
                                <FileDown className="w-4 h-4" /> SBI証券 CSVインポート
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                className="flex items-center gap-2 p-2 hover:bg-indigo-50 rounded-lg cursor-pointer text-slate-600 hover:text-indigo-900"
                                onClick={() => handleImportClick('RAKUTEN')}
                            >
                                <FileDown className="w-4 h-4" /> 楽天証券 CSVインポート
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                className="flex items-center gap-2 p-2 hover:bg-indigo-50 rounded-lg cursor-pointer text-slate-600 hover:text-indigo-900"
                                onClick={() => handleImportClick('ANALYSIS')}
                            >
                                <UploadCloud className="w-4 h-4" /> 分析データ取込
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                className="flex items-center gap-2 p-2 hover:bg-rose-50 rounded-lg cursor-pointer text-rose-600 hover:text-rose-900 border-t border-slate-100 mt-1"
                                onClick={handleDeleteAll}
                            >
                                <Trash2 className="w-4 h-4" /> 全データを削除
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>

                    <Dialog open={!!importMode} onOpenChange={(open) => !open && setImportMode(null)}>
                        <DialogContent className="sm:max-w-md">
                            <DialogHeader>
                                <DialogTitle>CSVファイルをインポート</DialogTitle>
                                <DialogDescription>
                                    {importMode === 'ANALYSIS' ? '分析データCSV' :
                                        importMode === 'SBI' ? 'SBI証券の保有証券CSV' : '楽天証券の保有商品CSV'}
                                    をここにドロップしてください。
                                </DialogDescription>
                            </DialogHeader>
                            <div
                                className={`
                                    mt-4 border-2 border-dashed rounded-xl p-8 transition-colors text-center cursor-pointer
                                    ${isDragOver ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:border-indigo-300 hover:bg-slate-50'}
                                `}
                                onDragOver={handleDragOver}
                                onDragLeave={handleDragLeave}
                                onDrop={handleDrop}
                                onClick={() => fileInputRef.current?.click()}
                            >
                                <UploadCloud className={`w-12 h-12 mx-auto mb-3 ${isDragOver ? 'text-indigo-500' : 'text-slate-300'}`} />
                                <p className="text-sm font-medium text-slate-700">
                                    ファイルをドラッグ＆ドロップ
                                </p>
                                <p className="text-xs text-slate-400 mt-1">
                                    またはクリックしてファイルを選択
                                </p>
                            </div>

                            <div className="mt-4 flex items-center space-x-2 justify-center">
                                <input
                                    type="checkbox"
                                    id="appendMode"
                                    checked={isAppendMode}
                                    onChange={(e) => setIsAppendMode(e.target.checked)}
                                    className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600"
                                />
                                <label
                                    htmlFor="appendMode"
                                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 text-slate-700 select-none cursor-pointer"
                                >
                                    既存のリストに追加する（前のデータを消さない）
                                </label>
                            </div>
                        </DialogContent>
                    </Dialog>
                </div>
            </div>


            {/* Loading Overlay */}
            {
                isLoading && (
                    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center backdrop-blur-sm">
                        <div className="bg-white p-6 rounded-xl shadow-2xl flex flex-col items-center gap-4 animate-in fade-in zoom-in duration-200">
                            <RefreshCcw className="w-8 h-8 text-indigo-600 animate-spin" />
                            <p className="text-slate-700 font-medium text-lg">データを解析・更新中...</p>
                            <p className="text-slate-500 text-sm">しばらくお待ちください</p>
                        </div>
                    </div>
                )
            }

            <p className="text-xs font-mono text-slate-400 uppercase tracking-wider flex-shrink-0">Holdings List</p>
            <p className="text-xs text-slate-400 mb-4 mt-1 flex-shrink-0">※株価は20分以上遅延している場合があります。</p>

            <div className="overflow-auto border border-slate-100 rounded-xl flex-grow">
                <table className="w-full min-w-[1200px] border-collapse bg-white">
                    <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                        <tr className="text-xs font-bold text-slate-400 uppercase tracking-wider text-right">
                            <th className="px-4 py-3 text-left whitespace-nowrap w-[80px]">Rank</th>
                            <th className="px-4 py-3 text-left whitespace-nowrap w-[60px]">Score</th>
                            <th className="px-4 py-3 text-left whitespace-nowrap">コード</th>
                            <th className="px-4 py-3 text-left whitespace-nowrap">銘柄名</th>
                            <th className="px-4 py-3 text-left whitespace-nowrap">セクター</th>
                            <th className="px-4 py-3 whitespace-nowrap">取得単価</th>
                            <th className="px-4 py-3 whitespace-nowrap">現在の株価</th>
                            <th className="px-4 py-3 whitespace-nowrap">保有株数</th>
                            <th className="px-4 py-3 whitespace-nowrap">総資産</th>
                            <th className="px-4 py-3 whitespace-nowrap">損益</th>
                            <th className="px-4 py-3 whitespace-nowrap">1株配当</th>
                            <th className="px-4 py-3 whitespace-nowrap">配当金総額</th>
                        </tr>
                    </thead>
                    <motion.tbody
                        className="divide-y divide-slate-100"
                        variants={container}
                        initial="hidden"
                        animate="show"
                    >
                        <AnimatePresence mode="wait">
                            {holdings.map((stock, i) => {
                                const totalDividends = stock.quantity * stock.dividendPerShare;
                                const totalAssets = stock.quantity * stock.price;
                                const yieldPercent = stock.price > 0 ? (stock.dividendPerShare / stock.price) * 100 : 0;

                                // Source Logic
                                const isSBI = stock.source.includes('SBI');
                                const isRakuten = stock.source.includes('Rakuten');
                                const isOther = (!isSBI && !isRakuten) || stock.source.includes('Manual');

                                // 損益 formatting
                                const gainLoss = stock.totalGainLoss;
                                const isGain = gainLoss > 0;
                                const isLoss = gainLoss < 0;
                                const gainLossColor = isGain ? 'text-rose-500' : isLoss ? 'text-blue-500' : 'text-slate-600';
                                const gainLossSign = isGain ? '+' : '';

                                // Formatter helper
                                const formatYen = (val: number) => val === 0 ? '-' : `¥${Math.round(val).toLocaleString()}`;
                                const formatNum = (val: number) => val === 0 ? '-' : val.toLocaleString();

                                return (
                                    <motion.tr
                                        key={stock.code}
                                        custom={i}
                                        variants={itemVariant}
                                        initial="hidden"
                                        animate="show"
                                        exit="hidden"
                                        layout
                                        className="group hover:bg-indigo-50/30 transition-colors duration-200"
                                    >
                                        <td className="px-4 py-3 whitespace-nowrap text-left">
                                            <div className="flex items-center gap-2">
                                                {stock.ir_rank ? (
                                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shadow-sm ring-1 ${getRankColor(stock.ir_rank)}`} title={`${stock.ir_detail || ''} (${stock.ir_date || ''})`}>
                                                        {stock.ir_rank}
                                                    </div>
                                                ) : (
                                                    <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-300 text-xs font-medium">
                                                        -
                                                    </div>
                                                )}
                                                {stock.ir_flag && (
                                                    <div className="text-rose-500 cursor-help" title={stock.ir_flag}>
                                                        <AlertTriangle className="w-5 h-5 drop-shadow-sm" />
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap text-left">
                                            {stock.ir_score ? (
                                                <span className="font-bold text-slate-700 text-sm">{stock.ir_score}</span>
                                            ) : (
                                                <span className="text-slate-300">-</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap">
                                            <div className="w-12 h-8 rounded bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-xs ring-2 ring-transparent group-hover:ring-indigo-100 transition-all">
                                                {stock.code}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2 overflow-hidden max-w-[200px]">
                                                <div className="font-bold text-slate-800 text-sm truncate" title={stock.name}>
                                                    {stock.name}
                                                </div>
                                                <div className="flex gap-1 flex-shrink-0">
                                                    {isSBI && (
                                                        <span className="bg-blue-100 text-blue-700 text-[10px] px-1.5 py-0.5 rounded font-bold whitespace-nowrap">S</span>
                                                    )}
                                                    {isRakuten && (
                                                        <span className="bg-rose-100 text-rose-700 text-[10px] px-1.5 py-0.5 rounded font-bold whitespace-nowrap">楽</span>
                                                    )}
                                                    {isOther && (
                                                        <span className="bg-slate-100 text-slate-600 text-[10px] px-1.5 py-0.5 rounded font-bold whitespace-nowrap">
                                                            その他
                                                        </span>
                                                    )}
                                                    {(stock.accountType === 'NISA' || stock.accountType === 'Mixed') && (
                                                        <span className="bg-emerald-100 text-emerald-700 text-[10px] px-1.5 py-0.5 rounded font-bold whitespace-nowrap">NISA</span>
                                                    )}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-left text-xs text-slate-500 whitespace-nowrap">
                                            {stock.sector || '-'}
                                        </td>
                                        <td className="px-4 py-3 text-right font-medium text-slate-500 whitespace-nowrap">
                                            {formatYen(stock.acquisitionPrice)}
                                        </td>
                                        <td className={`px-4 py-3 text-right font-medium whitespace-nowrap ${stock.price === 0 ? 'text-rose-500' : 'text-slate-800'}`}>
                                            {stock.price === 0 ? (
                                                <span className="text-xs">取得失敗</span>
                                            ) : (
                                                formatYen(stock.price)
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-right text-slate-600 font-mono whitespace-nowrap">
                                            {formatNum(stock.quantity)}
                                        </td>
                                        <td className="px-4 py-3 text-right font-bold text-indigo-900 whitespace-nowrap">
                                            {formatYen(totalAssets)}
                                        </td>
                                        <td className={`px-4 py-3 text-right font-bold whitespace-nowrap ${gainLossColor}`}>
                                            {stock.totalGainLoss === 0 ? '-' : `${gainLossSign}¥${Math.abs(stock.totalGainLoss).toLocaleString()}`}
                                        </td>
                                        <td className="px-4 py-3 text-right whitespace-nowrap">
                                            <div className="text-slate-800">{formatYen(stock.dividendPerShare)}</div>
                                            {stock.dividendPerShare > 0 && stock.price > 0 && (
                                                <div className="text-[10px] text-emerald-500 font-medium flex items-center justify-end gap-1">
                                                    <TrendingUp className="w-3 h-3" /> {yieldPercent.toFixed(2)}%
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-right font-bold text-indigo-600 whitespace-nowrap">
                                            {formatYen(totalDividends)}
                                        </td>
                                    </motion.tr>
                                );
                            })}
                        </AnimatePresence>
                    </motion.tbody>
                </table>
            </div>
        </div >
    );
}

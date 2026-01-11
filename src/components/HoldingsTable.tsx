
import { TrendingUp, MoreHorizontal, FileDown } from 'lucide-react';
import { HOLDINGS, Holding } from '@/lib/mockData';
import { motion, AnimatePresence, Variants } from 'framer-motion';
import { useState, useRef, useEffect } from 'react';
import { parseRakutenCSV, parseSBICSV, loadCSV } from '@/utils/csvParser';
import { createClient } from '@/utils/supabase/client';

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function HoldingsTable({ isSampleMode = false }: { isSampleMode?: boolean }) {
    const [holdings, setHoldings] = useState<Holding[]>(() => {
        if (isSampleMode) return HOLDINGS;
        return [];
    });

    const supabase = createClient();

    // Fetch and Aggregate Data from Supabase
    const fetchHoldings = async () => {
        if (isSampleMode) return;

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return; // Not logged in

        const { data, error } = await supabase
            .from('holdings')
            .select('*');

        if (error) {
            console.error('Error fetching holdings:', error);
            return;
        }

        if (data) {
            // Aggregation Logic (Client-side merge)
            // Separate rows in DB -> Aggregated view in UI
            const mergedMap = new Map<string, Holding>();

            data.forEach((row: any) => {
                // Map DB snake_case to JS camelCase
                const item: Holding = {
                    code: row.code,
                    name: row.name,
                    quantity: Number(row.quantity),
                    price: Number(row.price),
                    acquisitionPrice: Number(row.acquisition_price),
                    totalGainLoss: Number(row.total_gain_loss),
                    dividendPerShare: Number(row.dividend_per_share),
                    source: row.source || [], // text[]
                    accountType: row.account_type || '特定',
                    sector: row.sector || '',
                };

                const existing = mergedMap.get(item.code);

                if (existing) {
                    // Weighted Average & Sum
                    const totalQty = existing.quantity + item.quantity;
                    const newAvgPrice = totalQty > 0
                        ? ((existing.acquisitionPrice * existing.quantity) + (item.acquisitionPrice * item.quantity)) / totalQty
                        : 0;

                    // Merge Metadata
                    const mergedSource = Array.from(new Set([...existing.source, ...item.source]));
                    const mergedAccount = existing.accountType !== item.accountType ? 'Mixed' : existing.accountType;

                    mergedMap.set(item.code, {
                        ...existing,
                        quantity: totalQty,
                        acquisitionPrice: newAvgPrice,
                        price: item.price, // Use latest price (usually same if from same CSV, or strictly latest)
                        totalGainLoss: existing.totalGainLoss + item.totalGainLoss,
                        source: mergedSource,
                        accountType: mergedAccount,
                        sector: existing.sector || item.sector,
                    });
                } else {
                    mergedMap.set(item.code, item);
                }
            });

            setHoldings(Array.from(mergedMap.values()));
        }
    };

    // Initial Load
    useEffect(() => {
        if (!isSampleMode) {
            fetchHoldings();
        }
    }, [isSampleMode]);

    // 4. Other Hooks
    // 4. Other Hooks
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [importType, setImportType] = useState<'sbi' | 'rakuten' | null>(null);
    const importTypeRef = useRef<'sbi' | 'rakuten' | null>(null);

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

    const handleImportClick = (type: 'sbi' | 'rakuten') => {
        if (isSampleMode) {
            alert("インポート機能を利用するにはログインしてください");
            return;
        }

        setImportType(type);
        importTypeRef.current = type;
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
            fileInputRef.current.click();
        }
    };

    // DB Save Logic (Delete & Insert)
    const saveHoldingsToSupabase = async (newItems: Holding[], currentImportType: 'sbi' | 'rakuten') => {
        if (isSampleMode) return;

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            alert("セッションが切れました。ログインしてください。");
            return;
        }

        const targetTag = currentImportType === 'sbi' ? 'SBI' : 'Rakuten';

        // Step A: Delete existing records for this source
        const { error: deleteError } = await supabase
            .from('holdings')
            .delete()
            .eq('user_id', user.id)
            .contains('source', [targetTag]); // source @> '{Tag}'

        if (deleteError) {
            console.error("Delete Error:", deleteError);
            alert("データの更新（削除）に失敗しました");
            return;
        }

        // Step B: Insert new records
        // Map JS camelCase to DB snake_case
        const dbRows = newItems.map(item => ({
            user_id: user.id,
            code: item.code,
            name: item.name,
            quantity: item.quantity,
            price: item.price,
            acquisition_price: item.acquisitionPrice,
            total_gain_loss: item.totalGainLoss,
            dividend_per_share: item.dividendPerShare,
            source: item.source, // e.g. ['SBI']
            account_type: item.accountType,
            sector: item.sector
        }));

        const { error: insertError } = await supabase
            .from('holdings')
            .insert(dbRows);

        if (insertError) {
            console.error("Insert Error:", insertError);
            alert("データの保存に失敗しました");
            return;
        }

        // Refresh UI
        await fetchHoldings();
        alert('インポートが完了しました');
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        const currentImportType = importTypeRef.current;
        if (!file || !currentImportType) return;

        try {
            const content = await loadCSV(file);
            let newHoldings: Holding[] = [];

            if (currentImportType === 'sbi') {
                newHoldings = parseSBICSV(content);
            } else {
                newHoldings = parseRakutenCSV(content);
            }

            if (newHoldings.length > 0) {
                await saveHoldingsToSupabase(newHoldings, currentImportType);
            } else {
                alert("読み込み可能なデータが見つかりませんでした");
            }

        } catch (error) {
            console.error("Import Error:", error);
            alert("ファイルの読み込みに失敗しました");
        }

        // Reset input
        if (fileInputRef.current) fileInputRef.current.value = '';
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

                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button className="text-slate-400 hover:text-indigo-600 outline-none">
                            <MoreHorizontal />
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-white rounded-xl shadow-xl border border-slate-100 p-2 min-w-[200px]">
                        <DropdownMenuItem
                            className="flex items-center gap-2 p-2 hover:bg-indigo-50 rounded-lg cursor-pointer text-slate-600 hover:text-indigo-900"
                            onClick={() => handleImportClick('sbi')}
                        >
                            <FileDown className="w-4 h-4" /> SBI証券 CSVインポート
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            className="flex items-center gap-2 p-2 hover:bg-indigo-50 rounded-lg cursor-pointer text-slate-600 hover:text-indigo-900"
                            onClick={() => handleImportClick('rakuten')}
                        >
                            <FileDown className="w-4 h-4" /> 楽天証券 CSVインポート
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
            <p className="text-xs font-mono text-slate-400 mb-4 uppercase tracking-wider flex-shrink-0">Holdings List</p>

            <div className="overflow-auto border border-slate-100 rounded-xl flex-grow">
                <table className="w-full min-w-[1000px] border-collapse bg-white">
                    <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                        <tr className="text-xs font-bold text-slate-400 uppercase tracking-wider text-right">
                            <th className="px-4 py-3 text-left whitespace-nowrap">コード</th>
                            <th className="px-4 py-3 text-left whitespace-nowrap">銘柄名</th>
                            <th className="px-4 py-3 whitespace-nowrap">取得単価</th>
                            <th className="px-4 py-3 whitespace-nowrap">株価</th>
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
                                        <td className="px-4 py-3 text-right font-medium text-slate-500 whitespace-nowrap">
                                            {formatYen(stock.acquisitionPrice)}
                                        </td>
                                        <td className="px-4 py-3 text-right font-medium text-slate-800 whitespace-nowrap">
                                            {formatYen(stock.price)}
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
        </div>
    );
}

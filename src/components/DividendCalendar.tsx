'use client';

import { motion } from 'framer-motion';
import { MONTHLY_DIVIDENDS_DATA } from '@/lib/mockData';
import { useState, useEffect } from 'react';
import { checkPremiumAccess } from '@/app/actions/subscriptionActions';
import { Lock, Sparkles } from 'lucide-react';

type MonthlyDividend = {
    month: string;
    amount: number;
};

export function DividendCalendar({
    onUpgradeClick,
    isSampleMode = false,
    monthlyData,
}: {
    onUpgradeClick?: () => void,
    isSampleMode?: boolean,
    monthlyData?: MonthlyDividend[],
}) {
    const displayData = monthlyData && monthlyData.some(item => item.amount > 0)
        ? monthlyData
        : MONTHLY_DIVIDENDS_DATA;
    const isActualData = Boolean(monthlyData && monthlyData.some(item => item.amount > 0));
    const maxAmount = Math.max(...displayData.map(d => d.amount), 1) * 1.1; // Add buffer

    const [hasAccess, setHasAccess] = useState(true);
    const currentMonth = new Date().getMonth() + 1; // 1-12

    useEffect(() => {
        // サンプルモードの場合はチェックせず、アクセス許可
        if (isSampleMode) {
            setHasAccess(true);
            return;
        }
        const check = async () => {
            const result = await checkPremiumAccess();
            setHasAccess(result.hasAccess);
        };
        check();
    }, [isSampleMode]);

    const container = {
        hidden: { opacity: 0 },
        show: {
            opacity: 1,
            transition: {
                staggerChildren: 0.08,
                delayChildren: 0.2
            }
        }
    };

    const barVariant = {
        hidden: { opacity: 0 },
        show: { opacity: 1 }
    };

    return (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-indigo-50 w-full">
            <h3 className="text-xl font-bold text-indigo-900 mb-2 flex items-center gap-2">
                月別配当カレンダー
                {isActualData && (
                    <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700">
                        実績
                    </span>
                )}
            </h3>
            <p className="text-xs font-mono text-slate-400 mb-2 uppercase tracking-widest">MONTHLY DIVIDENDS</p>
            <p className="mb-8 text-xs text-slate-400">
                {isActualData ? 'SBI入出金明細から取り込んだ今年の配当実績です。' : '配当金履歴を取り込むと、実績ベースの月別配当が表示されます。'}
            </p>

            <motion.div
                className="w-full h-[250px] flex items-end justify-between gap-2 md:gap-4 px-2"
                variants={container}
                initial="hidden"
                whileInView="show"
                viewport={{ once: true, amount: 0.2 }}
            >
                {displayData.map((item, index) => {
                    const heightPercent = (item.amount / maxAmount) * 100;
                    // ロック条件: アクセス権がなく、かつ今月でない場合
                    const isLocked = !hasAccess && item.month !== `${currentMonth}月`;

                    return (
                        <div
                            key={item.month}
                            className={`flex-1 flex flex-col items-center justify-end h-full gap-2 group relative ${isLocked ? 'cursor-not-allowed' : ''}`}
                            onClick={isLocked ? onUpgradeClick : undefined}
                        >
                            {/* Tooltip (ロック時は非表示) */}
                            {!isLocked && (
                                <div className="absolute -top-10 opacity-0 group-hover:opacity-100 transition-opacity bg-indigo-900 text-white text-xs font-bold py-1 px-2 rounded-lg pointer-events-none whitespace-nowrap z-10 shadow-lg mb-2">
                                    ¥{item.amount.toLocaleString()}
                                    <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-full border-4 border-transparent border-t-indigo-900"></div>
                                </div>
                            )}

                            {/* Bar Container */}
                            <div className="w-full bg-slate-100/50 rounded-t-md relative flex items-end h-full overflow-hidden">
                                {isLocked ? (
                                    // ロック時のバー表示
                                    <div className="w-full h-full bg-slate-100 flex items-end justify-center pb-2 relative overflow-hidden group-hover:bg-slate-200 transition-colors">
                                        <div className="absolute inset-0 bg-slate-200/50" style={{ height: '30%' }}></div>
                                        <Lock className="w-3 h-3 text-slate-400 z-10" />
                                    </div>
                                ) : (
                                    // 通常時のバー表示
                                    <motion.div
                                        variants={barVariant}
                                        initial={{ height: 0, opacity: 0 }}
                                        whileInView={{ height: `${heightPercent}%`, opacity: 1 }}
                                        viewport={{ once: true, amount: 0.2 }}
                                        transition={{
                                            type: "spring" as const,
                                            stiffness: 100,
                                            damping: 12,
                                            delay: index * 0.05,
                                        }}
                                        className="w-full bg-gradient-to-t from-cyan-500 via-blue-400 to-amber-300 rounded-t-md opacity-90 group-hover:opacity-100 transition-opacity"
                                    />
                                )}
                            </div>

                            <span className={`text-xs font-bold ${isLocked ? 'text-slate-300' : (item.month === `${currentMonth}月` ? 'text-indigo-600' : 'text-slate-400')}`}>
                                {item.month}
                            </span>
                        </div>
                    );
                })}
            </motion.div>

            {/* Pro登録リンク */}
            {!hasAccess && (
                <div className="mt-6 pt-4 border-t border-slate-100 text-center">
                    <button
                        onClick={onUpgradeClick}
                        className="text-xs font-bold text-indigo-600 hover:text-indigo-700 flex items-center justify-center gap-1 mx-auto transition-colors"
                    >
                        <Sparkles className="w-3 h-3" />
                        すべての月の配当を表示
                    </button>
                </div>
            )}
        </div>
    );
}

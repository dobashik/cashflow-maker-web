'use client';

import { TrendingUp, MoreHorizontal } from 'lucide-react';
import { HOLDINGS } from '@/lib/mockData';
import { motion } from 'framer-motion';

export function HoldingsTable() {
    const container = {
        hidden: { opacity: 0 },
        show: {
            opacity: 1,
            transition: {
                staggerChildren: 0.1
            }
        }
    };

    const itemVariant = {
        hidden: { x: -50, opacity: 0 },
        show: {
            x: 0,
            opacity: 1,
            transition: {
                type: "spring" as const,
                stiffness: 300,
                damping: 24
            }
        }
    };

    return (
        <div className="bg-white rounded-3xl p-6 shadow-xl border border-indigo-50 overflow-hidden">
            <div className="flex items-center justify-between mb-2">
                <h3 className="text-xl font-bold text-indigo-900 flex items-center gap-2">
                    保有株式リスト
                </h3>
                <button className="text-slate-400 hover:text-indigo-600">
                    <MoreHorizontal />
                </button>
            </div>
            <p className="text-xs font-mono text-slate-400 mb-6 uppercase tracking-wider">Holdings List</p>

            {/* Header for Desktop */}
            <div className="bg-white sticky top-0 z-10 min-w-[800px] grid grid-cols-12 text-xs font-bold text-slate-400 uppercase tracking-wider px-4 py-2 border-b border-slate-100 gap-4">
                <div className="col-span-1">コード</div>
                <div className="col-span-3">銘柄名</div>
                <div className="col-span-1 text-right">株価</div>
                <div className="col-span-1 text-right">保有株数</div>
                <div className="col-span-2 text-right">総資産</div>
                <div className="col-span-2 text-right">1株配当</div>
                <div className="col-span-2 text-right">配当金総額</div>
            </div>

            <div className="h-[500px] overflow-y-auto pr-2 md:overflow-x-hidden overflow-x-auto">
                <motion.div
                    className="space-y-3 min-w-[800px]"
                    variants={container}
                    initial="hidden"
                    whileInView="show"
                    viewport={{ once: true }}
                >
                    {HOLDINGS.map((stock) => {
                        const totalDividends = stock.quantity * stock.dividendPerShare;
                        const totalAssets = stock.quantity * stock.price;
                        const yieldPercent = (stock.dividendPerShare / stock.price) * 100;

                        return (
                            <motion.div
                                key={stock.code}
                                variants={itemVariant}
                                className="group grid grid-cols-12 items-center p-4 rounded-2xl bg-slate-50 hover:bg-white hover:shadow-lg transition-all duration-300 border border-transparent hover:border-indigo-100 cursor-pointer gap-4"
                            >
                                {/* Code */}
                                <div className="col-span-1">
                                    <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-xs ring-2 ring-transparent group-hover:ring-indigo-100 transition-all">
                                        {stock.code}
                                    </div>
                                </div>

                                {/* Name Info */}
                                <div className="col-span-3">
                                    <div className="font-bold text-slate-800 text-sm truncate" title={stock.name}>{stock.name}</div>
                                </div>

                                {/* Price */}
                                <div className="col-span-1 text-right font-medium text-slate-600">
                                    ¥{stock.price.toLocaleString()}
                                </div>

                                {/* Quantity */}
                                <div className="col-span-1 text-right text-slate-600">
                                    {stock.quantity.toLocaleString()}
                                </div>

                                {/* Total Assets */}
                                <div className="col-span-2 text-right font-bold text-indigo-900">
                                    ¥{totalAssets.toLocaleString()}
                                </div>

                                {/* Div Per Share & Yield */}
                                <div className="col-span-2 text-right">
                                    <div className="text-slate-800">¥{stock.dividendPerShare}</div>
                                    <div className="text-[10px] text-emerald-500 font-medium flex items-center justify-end gap-1">
                                        <TrendingUp className="w-3 h-3" /> {yieldPercent.toFixed(2)}%
                                    </div>
                                </div>

                                {/* Total Dividend */}
                                <div className="col-span-2 text-right">
                                    <div className="font-bold text-indigo-600">¥{totalDividends.toLocaleString()}</div>
                                </div>
                            </motion.div>
                        );
                    })}
                </motion.div>
            </div>
        </div>
    );
}

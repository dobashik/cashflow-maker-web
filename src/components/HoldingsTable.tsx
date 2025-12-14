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
        <div className="bg-white rounded-3xl p-6 shadow-xl border border-indigo-50">
            <div className="flex items-center justify-between mb-2">
                <h3 className="text-xl font-bold text-indigo-900 flex items-center gap-2">
                    保有株式の宝箱
                </h3>
                <button className="text-slate-400 hover:text-indigo-600">
                    <MoreHorizontal />
                </button>
            </div>
            <p className="text-xs font-mono text-slate-400 mb-6 uppercase tracking-wider">Treasure List</p>

            {/* Header for Desktop */}
            <div className="hidden sm:grid grid-cols-12 text-xs font-bold text-slate-400 uppercase tracking-wider px-4 mb-2">
                <div className="col-span-1">コード</div>
                <div className="col-span-5">銘柄名</div>
                <div className="col-span-3 text-right">現在値</div>
                <div className="col-span-3 text-right">予想配当金</div>
            </div>

            <motion.div
                className="space-y-3"
                variants={container}
                initial="hidden"
                whileInView="show"
                viewport={{ once: true }}
            >
                {HOLDINGS.map((stock) => {
                    const totalDividends = stock.quantity * stock.dividendPerShare;
                    const yieldPercent = (stock.dividendPerShare / stock.price) * 100;

                    return (
                        <motion.div
                            key={stock.code}
                            variants={itemVariant}
                            className="group grid grid-cols-12 items-center p-4 rounded-2xl bg-slate-50 hover:bg-white hover:shadow-lg transition-all duration-300 border border-transparent hover:border-indigo-100 cursor-pointer"
                        >
                            {/* Code */}
                            <div className="col-span-3 sm:col-span-1">
                                <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-xs ring-2 ring-transparent group-hover:ring-indigo-100 transition-all">
                                    {stock.code}
                                </div>
                            </div>

                            {/* Name Info */}
                            <div className="col-span-9 sm:col-span-5 pl-2 sm:pl-0">
                                <div className="font-bold text-slate-800 text-sm sm:text-base">{stock.name}</div>
                                <div className="text-xs text-slate-400">{stock.quantity} shares</div>
                            </div>

                            {/* Price / Yield (Mobile hidden mostly, but flex logic handled via grid) */}
                            <div className="col-span-6 sm:col-span-3 text-right mt-2 sm:mt-0 flex flex-col justify-center">
                                <div className="text-sm font-semibold text-slate-600">¥{stock.price.toLocaleString()}</div>
                                <div className="text-xs text-emerald-500 font-medium flex items-center justify-end gap-1">
                                    <TrendingUp className="w-3 h-3" /> {yieldPercent.toFixed(2)}%
                                </div>
                            </div>

                            {/* Dividend */}
                            <div className="col-span-6 sm:col-span-3 text-right mt-2 sm:mt-0 flex flex-col justify-center">
                                <div className="font-bold text-indigo-600">¥{totalDividends.toLocaleString()}</div>
                                <div className="text-[10px] text-slate-400">利回り</div>
                            </div>
                        </motion.div>
                    );
                })}
            </motion.div>
        </div>
    );
}

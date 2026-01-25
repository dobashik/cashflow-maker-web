'use client';

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';
import { useState, useMemo } from 'react';
import { Holding } from '@/lib/mockData';

// 1. 17業種マスター定数の定義 (User Specified)
const SECTOR_MASTER_LIST = [
    '食品', '医薬品', '情報通信・サービスその他', '運輸・物流',
    '建設・資材', '小売', '不動産', '鉄鋼・非鉄',
    'エネルギー資源', '商社・卸売', '金融（除く銀行）', '電力・ガス',
    '素材・化学', '機械', '電機・精密', '自動車・輸送機', '銀行'
];

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d', '#ffc658', '#8dd1e1'];

export function PortfolioPie({ holdings = [] }: { holdings?: Holding[] }) {
    const [hoveredSector, setHoveredSector] = useState<string | null>(null);

    // 2. リアルタイム集計ロジック (Updated with Count)
    const data = useMemo(() => {
        // Step 1: Aggregate by sector
        const sectorCalc = new Map<string, { value: number; count: number }>();

        holdings.forEach(item => {
            const sector = item.sector || 'その他';
            const value = (item.price || 0) * (item.quantity || 0);

            const key = SECTOR_MASTER_LIST.includes(sector) ? sector : 'その他';
            const current = sectorCalc.get(key) || { value: 0, count: 0 };

            sectorCalc.set(key, {
                value: current.value + value,
                count: current.count + 1
            });
        });

        // Step 2: Merge with Master List
        const result = SECTOR_MASTER_LIST.map(sector => {
            const data = sectorCalc.get(sector) || { value: 0, count: 0 };
            return {
                name: sector,
                value: data.value,
                count: data.count
            };
        });

        // Add 'Others' if it exists and has value
        const othersData = sectorCalc.get('その他');
        if (othersData && othersData.value > 0) {
            result.push({
                name: 'その他',
                value: othersData.value,
                count: othersData.count
            });
        }

        // Step 3: Sort by value descending
        return result.sort((a, b) => b.value - a.value);
    }, [holdings]);

    const totalAssets = useMemo(() => data.reduce((sum, item) => sum + item.value, 0), [data]);

    // Filter for Pie Chart (Assets > 0 only)
    const pieData = useMemo(() => data.filter(d => d.value > 0), [data]);

    return (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-indigo-50 relative overflow-hidden h-full">
            <h3 className="text-xl font-bold text-indigo-900 mb-2 flex items-center gap-2">
                セクター分析
            </h3>
            <p className="text-xs font-mono text-slate-400 mb-6 uppercase tracking-wider">SECTOR ANALYSIS</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">

                {/* Left: Sector List (Updated Layout) */}
                <div className="h-[350px] overflow-y-auto pr-2 custom-scrollbar order-2 md:order-1">
                    <div className="flex flex-col">
                        {data.map((entry, index) => {
                            const isZero = entry.value === 0;
                            const percentage = totalAssets > 0 ? ((entry.value / totalAssets) * 100).toFixed(1) : '0.0';
                            const isHovered = hoveredSector === entry.name;

                            // Determine color based on pie data index for consistency
                            const colorIndex = pieData.findIndex(p => p.name === entry.name);
                            const sectorColor = colorIndex >= 0 ? COLORS[colorIndex % COLORS.length] : undefined;

                            return (
                                <motion.div
                                    key={entry.name}
                                    onMouseEnter={() => setHoveredSector(entry.name)}
                                    onMouseLeave={() => setHoveredSector(null)}
                                    initial={{ opacity: 0, x: -20 }}
                                    whileInView={{ opacity: 1, x: 0 }}
                                    viewport={{ once: true }}
                                    animate={{
                                        backgroundColor: isHovered ? '#f8fafc' : '#ffffff'
                                    }}
                                    transition={{ delay: index * 0.05 }}
                                    className={`
                                        flex items-center justify-between py-3 border-b border-slate-100 last:border-0 cursor-pointer transition-all
                                        ${isZero ? 'opacity-50' : ''}
                                    `}
                                >
                                    {/* Left Block */}
                                    <div className="flex flex-col items-start gap-1">
                                        <div className="flex items-center gap-2">
                                            <div
                                                className={`w-3 h-3 rounded-full flex-shrink-0 ${isZero ? 'bg-slate-200' : ''}`}
                                                style={{ backgroundColor: isZero ? undefined : sectorColor }}
                                            />
                                            <span className="text-sm font-medium text-slate-700 whitespace-normal">
                                                {entry.name}
                                            </span>
                                        </div>
                                        <div className="text-xs text-slate-400 pl-5">
                                            {isZero ? '0銘柄' : `${entry.count}銘柄`}
                                        </div>
                                    </div>

                                    {/* Right Block */}
                                    <div className="flex items-center gap-4">
                                        <div className="text-sm font-bold text-slate-900">
                                            {isZero ? '¥0' : `¥${entry.value.toLocaleString()}`}
                                        </div>
                                        <div className="text-xs font-medium bg-slate-100 text-slate-600 px-2 py-1 rounded-md min-w-[50px] text-center">
                                            {percentage}%
                                        </div>
                                    </div>
                                </motion.div>
                            );
                        })}
                    </div>
                </div>

                {/* Right: Pie Chart (Assets > 0 only) */}
                <div className="relative h-[300px] w-full order-1 md:order-2">
                    {totalAssets > 0 ? (
                        <motion.div
                            className="h-full w-full"
                            initial={{ opacity: 0, scale: 0.8 }}
                            whileInView={{ opacity: 1, scale: 1 }}
                            transition={{ type: "spring", duration: 1 }}
                        >
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={pieData}
                                        innerRadius={60}
                                        outerRadius={90}
                                        paddingAngle={2}
                                        dataKey="value"
                                        animationDuration={1500}
                                        onMouseEnter={(_, index) => setHoveredSector(pieData[index].name)}
                                        onMouseLeave={() => setHoveredSector(null)}
                                    >
                                        {pieData.map((entry, index) => {
                                            const isHovered = hoveredSector === entry.name;
                                            const isDimmed = hoveredSector && !isHovered;

                                            return (
                                                <Cell
                                                    key={`cell-${index}`}
                                                    fill={COLORS[index % COLORS.length]}
                                                    stroke="none"
                                                    fillOpacity={isDimmed ? 0.3 : 1}
                                                    className="transition-all duration-300 cursor-pointer"
                                                    style={{
                                                        transform: isHovered ? 'scale(1.05)' : 'scale(1)',
                                                        transformOrigin: 'center center',
                                                        outline: 'none'
                                                    }}
                                                />
                                            );
                                        })}
                                    </Pie>
                                    <Tooltip
                                        formatter={(value: number) => `¥${value.toLocaleString()}`}
                                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' }}
                                    />
                                </PieChart>
                            </ResponsiveContainer>

                            {/* Center Text */}
                            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                <div className="text-xs text-slate-400 font-medium tracking-widest uppercase">総資産</div>
                                <div className="text-xl font-black text-indigo-900">¥{(totalAssets / 10000).toFixed(0)}万</div>
                            </div>
                        </motion.div>
                    ) : (
                        <div className="flex items-center justify-center h-full text-slate-400 text-sm">
                            データがありません
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

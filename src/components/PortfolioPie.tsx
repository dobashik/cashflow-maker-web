'use client';

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { HOLDINGS } from '@/lib/mockData';
import { motion } from 'framer-motion';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

export function PortfolioPie() {
    // Aggregate by Sector
    const data = HOLDINGS.reduce((acc, curr) => {
        const existing = acc.find(item => item.name === curr.sector);
        const value = curr.quantity * curr.price;
        if (existing) {
            existing.value += value;
        } else {
            acc.push({ name: curr.sector, value });
        }
        return acc;
    }, [] as { name: string; value: number }[]);

    const totalAssets = data.reduce((sum, item) => sum + item.value, 0);

    return (
        <div className="bg-white rounded-3xl p-6 shadow-xl border border-indigo-50 relative overflow-hidden">
            <h3 className="text-xl font-bold text-indigo-900 mb-2 flex items-center gap-2">
                資産の「黄金バランス」
            </h3>
            <p className="text-xs font-mono text-slate-400 mb-6 uppercase tracking-wider">Sector Allocation</p>

            <motion.div
                className="h-[300px] w-full relative"
                initial={{ opacity: 0, scale: 0, rotate: -90 }}
                whileInView={{ opacity: 1, scale: 1, rotate: 0 }}
                viewport={{ once: true }}
                transition={{
                    type: "spring",
                    stiffness: 260,
                    damping: 20,
                    duration: 1.5
                }}
            >
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie
                            data={data}
                            innerRadius={60}
                            outerRadius={100}
                            paddingAngle={5}
                            dataKey="value"
                            animationDuration={1500}
                        >
                            {data.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke="none" />
                            ))}
                        </Pie>
                        <Tooltip
                            formatter={(value: number) => `¥${value.toLocaleString()}`}
                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' }}
                        />
                    </PieChart>
                </ResponsiveContainer>

                {/* Center Text */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.8, type: "spring" }}
                    className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"
                >
                    <div className="text-xs text-slate-400 font-medium tracking-widest uppercase">総資産額</div>
                    <div className="text-2xl font-black text-indigo-900">¥{(totalAssets / 10000).toFixed(0)}万</div>
                </motion.div>
            </motion.div>

            {/* Custom Legend */}
            <div className="flex flex-wrap gap-2 justify-center mt-4">
                {data.map((entry, index) => (
                    <div key={entry.name} className="flex items-center gap-1 bg-slate-50 px-3 py-1 rounded-full text-xs font-medium text-slate-600 border border-slate-100">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                        {entry.name}
                        <span className="text-slate-400 ml-1">{Math.round((entry.value / totalAssets) * 100)}%</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

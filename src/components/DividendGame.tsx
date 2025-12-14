'use client';

import { motion, useSpring, useTransform, useInView } from 'framer-motion';
import {  Droplets, Sparkles } from 'lucide-react';
import { EXPENSES, TOTAL_EXPENSES, MONTHLY_DIVIDEND } from '@/lib/mockData';
import { cn } from './ui/Button';
import { useEffect, useRef, useState } from 'react';

export function DividendGame() {
    const coveragePercent = Math.min(100, Math.round((MONTHLY_DIVIDEND / TOTAL_EXPENSES) * 100));
    
    // Count-up animation for percentage
    const motionValue = useSpring(0, { stiffness: 50, damping: 20 });
    const springValue = useTransform(motionValue, (value) => Math.round(value));
    const [displayPercent, setDisplayPercent] = useState(0);

    // Initial check for in-view to trigger animations
    const ref = useRef(null);
    const isInView = useInView(ref, { once: true });

    useEffect(() => {
        if (isInView) {
            // Delay the counter slightly to match water rise
             setTimeout(() => {
                motionValue.set(coveragePercent);
             }, 1000);
        }
    }, [isInView, coveragePercent, motionValue]);

    useEffect(() => {
        const unsubscribe = springValue.on("change", (latest) => {
            setDisplayPercent(latest);
        });
        return () => unsubscribe();
    }, [springValue]);

    // Stagger container for blocks
    const containerVariants = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: {
                staggerChildren: 0.15,
                delayChildren: 0.2
            }
        }
    };

    // Falling block variant
    const blockVariants = {
        hidden: { opacity: 0, y: -200, scale: 0.8 },
        visible: { 
            opacity: 1, 
            y: 0, 
            scale: 1,
            transition: { 
                type: "spring", 
                stiffness: 300, 
                damping: 15 
            }
        }
    };

    return (
        <section ref={ref} className="relative w-full max-w-5xl mx-auto min-h-[500px] flex flex-col md:flex-row items-end justify-center gap-12 p-8 overflow-hidden">
            {/* Background Decor */}
            <div className="absolute inset-0 -z-10 bg-gradient-to-b from-indigo-50/50 to-white rounded-3xl" />

            {/* Left: The Life Tower (Expenses) */}
            <div className="md:w-1/3 flex flex-col items-center w-full z-10">
                <h3 className="text-indigo-900 font-bold mb-1 flex items-center gap-2 text-2xl">
                   「配当金で賄う」自由の塔
                </h3>
                <p className="text-xs font-mono text-indigo-400 mb-4 tracking-widest uppercase">Life Tower</p>

                <motion.div 
                    variants={containerVariants}
                    initial="hidden"
                    animate={isInView ? "visible" : "hidden"}
                    className="w-full max-w-[220px] flex flex-col-reverse gap-1 p-4 bg-white/40 backdrop-blur-sm rounded-2xl border border-white shadow-xl relative"
                >
                    {EXPENSES.map((expense, index) => (
                        <motion.div
                            key={expense.id}
                            variants={blockVariants}
                            className={cn(
                                "w-full rounded-lg flex items-center justify-between px-3 py-2 text-white font-bold text-sm shadow-md relative overflow-hidden group hover:scale-105 transition-transform cursor-pointer",
                                expense.color
                            )}
                            style={{ height: `${(expense.amount / TOTAL_EXPENSES) * 300}px`, minHeight: '40px' }}
                        >
                            <span className="z-10 drop-shadow-md">{expense.label}</span>
                            <span className="z-10 text-xs opacity-90">¥{expense.amount.toLocaleString()}</span>

                            {/* Shine effect */}
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent -translate-x-full group-hover:animate-shimmer" />
                        </motion.div>
                    ))}
                </motion.div>
                <div className="mt-4 text-center text-sm text-slate-500 font-medium bg-white/60 px-4 py-2 rounded-full backdrop-blur-sm shadow-sm">
                    毎月の生活費合計: <span className="text-slate-800 font-bold text-lg">¥{TOTAL_EXPENSES.toLocaleString()}</span>
                </div>
            </div>

            {/* Right: The Magic Water (Dividends) */}
            <div className="md:w-1/3 w-full flex flex-col items-center z-10">
                <h3 className="text-indigo-900 font-bold mb-1 flex items-center gap-2 text-lg">
                    <Droplets className="w-5 h-5 text-cyan-500" /> 配当金でのカバー率
                </h3>
                
                <div className="relative w-full max-w-[240px] h-[350px] bg-white rounded-[40px] border-4 border-indigo-50 shadow-[0_20px_60px_-12px_rgba(56,189,248,0.2)] overflow-hidden transform transition-all hover:shadow-cyan-200/50">
                    {/* Simple bubbles/sparkles background */}
                    <div className="absolute inset-0 bg-slate-50"></div>

                    {/* Water */}
                    <motion.div
                        initial={{ height: '0%' }}
                        animate={isInView ? { height: `${coveragePercent}%` } : { height: '0%' }}
                        transition={{ duration: 2.5, ease: "easeInOut", delay: 1.0 }} 
                        className="absolute bottom-0 w-full bg-gradient-to-t from-cyan-500 via-sky-400 to-blue-300 opacity-90"
                    >
                         {/* Wave SVG - Always animating */}
                         <div className="absolute -top-5 left-0 w-[200%] h-8 animate-wave">
                            <svg className="w-full h-full fill-blue-300" viewBox="0 0 1200 120" preserveAspectRatio="none">
                                <path d="M321.39,56.44c58-10.79,114.16-30.13,172-41.86,82.39-16.72,168.19-17.73,250.45-.39C823.78,31,906.67,72,985.66,92.83c70.05,18.48,146.53,26.09,214.34,3V0H0V27.35A600.21,600.21,0,0,0,321.39,56.44Z"></path>
                            </svg>
                        </div>
                    </motion.div>

                    {/* Percentage Text Float */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center z-10 pointer-events-none">
                        <motion.div
                            initial={{ scale: 0, opacity: 0 }}
                            animate={isInView ? { scale: 1, opacity: 1 } : { scale: 0, opacity: 0 }}
                            transition={{ delay: 1.8, type: "spring", bounce: 0.5 }}
                            className="bg-white/90 backdrop-blur-xl px-6 py-4 rounded-3xl shadow-2xl border border-white/50 text-center"
                        >
                            <div className="text-[10px] text-indigo-400 font-bold uppercase tracking-widest mb-1">Coverage</div>
                            <div className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-cyan-600 tracking-tighter tabular-nums">
                                {displayPercent}<span className="text-2xl ml-1 text-indigo-400">%</span>
                            </div>
                        </motion.div>
                    </div>

                    {/* Floating Sparkles */}
                    <motion.div 
                        animate={{ y: [0, -10, 0] }} 
                        transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                        className="absolute top-10 right-8"
                    >
                        <Sparkles className="text-amber-400 w-6 h-6" />
                    </motion.div>
                    
                    <motion.div 
                        animate={{ y: [0, -5, 0] }} 
                        transition={{ repeat: Infinity, duration: 3, ease: "easeInOut", delay: 1 }}
                        className="absolute bottom-20 left-6"
                    >
                        <Sparkles className="text-cyan-300 w-4 h-4" />
                    </motion.div>
                </div>

                <div className="mt-6 text-center">
                    <div className="text-xs text-indigo-400 font-bold tracking-wider mb-1">ひと月あたりの配当収入</div>
                    <div className="text-3xl font-black text-indigo-700">¥{MONTHLY_DIVIDEND.toLocaleString()}</div>
                </div>
            </div>
        </section>
    );
}

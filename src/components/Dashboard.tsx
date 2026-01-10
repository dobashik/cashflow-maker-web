"use client";

import { useState } from 'react';
import { motion } from "framer-motion";
import { Header } from '@/components/Header';
import { DividendGame } from '@/components/DividendGame';
import { PortfolioPie } from '@/components/PortfolioPie';
import { HoldingsTable } from '@/components/HoldingsTable';
import { DividendCalendar } from '@/components/DividendCalendar';

export function DashboardContent({ animationKey = 0, isSampleMode = false }: { animationKey?: number, isSampleMode?: boolean }) {
    return (
        <div className="container mx-auto px-4 space-y-8">
            {/* 1. Holdings List Section (Moved to Top) */}
            <section id="holdings-list" className="w-full pt-4">
                <motion.div key={`holdings-${animationKey}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <HoldingsTable isSampleMode={isSampleMode} />
                </motion.div>
            </section>

            {/* 2. Main Dashboard Section (Analysis Report) */}
            <section id="analysis-report">
                <motion.div
                    key={`analysis-${animationKey}`}
                    initial={{ opacity: 0, y: 50 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                    viewport={{ once: true, amount: 0.2 }}
                    className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch"
                >
                    {/* Left Column: Dividend Coverage */}
                    <div className="w-full">
                        <DividendGame />
                    </div>

                    {/* Right Column: Sector Allocation */}
                    <div className="w-full">
                        <PortfolioPie />
                    </div>
                </motion.div>
            </section>

            {/* 3. Dividend Calendar Section */}
            <section id="dividend-calendar">
                <motion.div key={`calendar-${animationKey}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <DividendCalendar />
                </motion.div>
            </section>
        </div>
    );
}

export function Dashboard() {
    const [animationKey, setAnimationKey] = useState(0);

    const handleRefreshAnimations = () => {
        setAnimationKey(prev => prev + 1);
    };

    return (
        <div className="min-h-screen pb-20 bg-slate-50 selection:bg-indigo-100 selection:text-indigo-900">
            <Header onRefreshAnimations={handleRefreshAnimations} />

            {/* Spacer for fixed header */}
            <div className="h-24"></div>

            <DashboardContent animationKey={animationKey} />
        </div>
    );
}

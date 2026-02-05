"use client";

import { useState } from 'react';
import { motion } from "framer-motion";
import { Header } from '@/components/Header';
import { DividendGame } from '@/components/DividendGame';
import { PortfolioPie } from '@/components/PortfolioPie';
import { HoldingsTable } from '@/components/HoldingsTable';
import { DividendCalendar } from '@/components/DividendCalendar';
import { UpgradeModal } from '@/components/UpgradeModal';

import { Holding } from '@/lib/mockData';

export function DashboardContent({ animationKey = 0, isSampleMode = false }: { animationKey?: number, isSampleMode?: boolean }) {
    const [sharedHoldings, setSharedHoldings] = useState<Holding[]>([]);
    const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);

    return (
        <div className="container mx-auto px-4 space-y-8">
            {/* 1. 配当金生活進捗 (Dividend Progress) - Full Width */}
            <section id="dividend-progress" className="w-full pt-4 scroll-mt-28">
                <motion.div
                    key={`progress-${animationKey}`}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6 }}
                >
                    <DividendGame />
                </motion.div>
            </section>

            {/* 2. 保有株式リスト (Holdings Table) */}
            <section id="holdings-list" className="w-full scroll-mt-28">
                <motion.div
                    key={`holdings-${animationKey}`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.2 }}
                >
                    <HoldingsTable
                        isSampleMode={isSampleMode}
                        onDataUpdate={setSharedHoldings}
                        onUpgradeClick={() => setIsUpgradeModalOpen(true)}
                    />
                </motion.div>
            </section>

            {/* 3. セクター分析 (Sector Analysis) - Left: Pie, Right: List */}
            <section id="sector-analysis" className="w-full scroll-mt-28">
                <motion.div
                    key={`analysis-${animationKey}`}
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ margin: "-50px" }}
                    transition={{ duration: 0.5 }}
                >
                    <PortfolioPie
                        holdings={sharedHoldings}
                        onUpgradeClick={() => setIsUpgradeModalOpen(true)}
                    />
                </motion.div>
            </section>

            {/* 4. 月別配当カレンダー (Dividend Calendar) */}
            <section id="dividend-calendar" className="w-full scroll-mt-32">
                <motion.div
                    key={`calendar-${animationKey}`}
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ margin: "-50px" }}
                    transition={{ duration: 0.5 }}
                >
                    <DividendCalendar
                        onUpgradeClick={() => setIsUpgradeModalOpen(true)}
                    />
                </motion.div>
            </section>

            {/* アップグレードモーダル */}
            <UpgradeModal
                isOpen={isUpgradeModalOpen}
                onClose={() => setIsUpgradeModalOpen(false)}
            />
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

            <DashboardContent animationKey={animationKey} isSampleMode={false} />
        </div>
    );
}

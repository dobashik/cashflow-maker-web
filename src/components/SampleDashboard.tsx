"use client";

import { useState } from 'react';
import { Header } from "@/components/Header";
import { HeroSection } from "@/components/HeroSection";
import { DashboardContent } from "@/components/Dashboard";
import { Footer } from "@/components/Footer";
import Link from 'next/link';

export function SampleDashboard({ inviteRequired = false }: { inviteRequired?: boolean }) {
    const [animationKey, setAnimationKey] = useState(0);

    const handleRefreshAnimations = () => {
        setAnimationKey(prev => prev + 1);
    };

    return (
        <main className="min-h-screen bg-slate-50 selection:bg-indigo-100 selection:text-indigo-900">
            {/* Interactive Header for Logged-out users */}
            <Header onRefreshAnimations={handleRefreshAnimations} />

            {/* Spacer for fixed header */}
            <div className="h-20"></div>

            {inviteRequired && (
                <div className="mx-auto mt-4 flex w-[calc(100%-2rem)] max-w-5xl flex-col items-center justify-between gap-3 rounded-2xl border border-indigo-200 bg-indigo-50 px-5 py-4 text-sm text-indigo-950 shadow-sm sm:flex-row">
                    <p><strong>初めて利用する方へ：</strong>コミュニティから受け取った招待コードを入力してから、Googleアカウントを登録してください。</p>
                    <Link href="/join" className="shrink-0 rounded-xl bg-indigo-600 px-4 py-2 font-bold text-white hover:bg-indigo-700">招待コードを入力する</Link>
                </div>
            )}

            <HeroSection />

            {/* Warning Banner */}
            <div className="w-full bg-slate-50 border-t border-b border-slate-200 py-4 text-center relative z-10">
                <p className="text-slate-500 text-sm md:text-base font-medium flex items-center justify-center gap-2">
                    <span>⚠️</span>
                    以下はサンプルデータです。ログインすると、あなたの資産でシミュレーションできます。
                </p>
            </div>

            {/* Sample Dashboard (Dimmed) */}
            <div className="relative opacity-90 select-none">
                {/* Full-coverage Watermark */}
                <div
                    className="absolute inset-0 z-50 overflow-hidden pointer-events-none"
                    style={{
                        backgroundImage: `url("data:image/svg+xml,%3Csvg width='300' height='300' viewBox='0 0 300 300' xmlns='http://www.w3.org/2000/svg'%3E%3Ctext x='50%25' y='50%25' font-family='sans-serif' font-weight='bold' font-size='24' fill='%2394a3b8' fill-opacity='0.15' text-anchor='middle' dominant-baseline='middle' transform='rotate(-45 150 150)'%3ESAMPLE DATA%3C/text%3E%3C/svg%3E")`,
                        backgroundRepeat: 'repeat',
                        // Ensure it covers everything
                        height: '100%',
                        width: '100%',
                    }}
                />
                <div className="absolute inset-0 z-40 bg-gradient-to-b from-transparent via-transparent to-slate-50/30 pointer-events-none" />

                <div className="pt-8 pb-20 grayscale-[30%]">
                    <DashboardContent animationKey={animationKey} isSampleMode={true} />
                </div>
            </div>

            <Footer />
        </main>
    );
}

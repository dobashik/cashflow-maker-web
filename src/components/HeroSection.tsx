"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import { AuthModal } from "./AuthModal";
import { Sparkles, TrendingUp, PieChart, Calendar } from "lucide-react";

export function HeroSection() {
    const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

    return (
        <section className="relative w-full overflow-hidden bg-white pt-32 pb-20 lg:pt-40 lg:pb-32">
            {/* Background Decorations */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[1000px] bg-indigo-500/10 rounded-full blur-3xl pointer-events-none -z-10" />

            {/* Floating Icons Animation */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
                <motion.div
                    animate={{ y: [0, -20, 0], rotate: [0, 5, 0] }}
                    transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
                    className="absolute top-20 right-[10%] text-indigo-200"
                >
                    <PieChart size={64} strokeWidth={1.5} />
                </motion.div>
                <motion.div
                    animate={{ y: [0, 20, 0], rotate: [0, -5, 0] }}
                    transition={{ duration: 6, repeat: Infinity, ease: "easeInOut", delay: 1 }}
                    className="absolute bottom-40 left-[10%] text-purple-200"
                >
                    <TrendingUp size={48} strokeWidth={1.5} />
                </motion.div>
                <motion.div
                    animate={{ scale: [1, 1.1, 1], opacity: [0.3, 0.6, 0.3] }}
                    transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", delay: 2 }}
                    className="absolute top-40 left-[20%] text-amber-200"
                >
                    <Sparkles size={32} />
                </motion.div>
                <motion.div
                    animate={{ y: [0, -15, 0] }}
                    transition={{ duration: 7, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
                    className="absolute bottom-20 right-[20%] text-emerald-200"
                >
                    <Calendar size={56} strokeWidth={1.5} />
                </motion.div>
            </div>

            <div className="container mx-auto px-4 relative z-10 text-center">
                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                >
                    <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-slate-900 leading-tight mb-6">
                        <span className="inline-block">配当金が、</span>
                        <span className="inline-block">生活費を<span className="text-indigo-600">超える日</span>を</span>
                        <span className="inline-block">可視化する。</span>
                    </h1>

                    <p className="max-w-2xl mx-auto text-lg md:text-xl text-slate-600 mb-10 leading-relaxed">
                        銘柄リスト、セクター比率、配当カレンダーをこの一つに。<br />
                        複雑な管理から解放され、生活費に対する「配当カバー率」を常に把握。<br />
                        あなたの投資判断を、確かなデータで支えます。
                    </p>

                    <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setIsAuthModalOpen(true)}
                        className="inline-flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold py-4 px-8 rounded-full shadow-lg shadow-indigo-500/30 text-lg hover:shadow-indigo-500/50 transition-all"
                    >
                        <Sparkles className="w-5 h-5" />
                        無料でポートフォリオを作成
                    </motion.button>
                </motion.div>
            </div>

            <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
        </section>
    );
}

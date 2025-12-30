"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Loader2 } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { GoogleIcon } from "@/components/ui/icons";

type AuthModalProps = {
    isOpen: boolean;
    onClose: () => void;
};

export function AuthModal({ isOpen, onClose }: AuthModalProps) {
    const [isLoading, setIsLoading] = useState(false);
    const supabase = createClient();

    const handleGoogleLogin = async () => {
        setIsLoading(true);
        try {
            const { error } = await supabase.auth.signInWithOAuth({
                provider: "google",
                options: {
                    redirectTo: `${window.location.origin}/auth/callback`,
                },
            });
            if (error) throw error;
        } catch (error) {
            console.error("Login error:", error);
            setIsLoading(false);
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black/30 backdrop-blur-sm z-[100] grid place-items-center p-4 overflow-y-auto"
                    >
                        {/* Modal */}
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0, y: 10 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.95, opacity: 0, y: 10 }}
                            onClick={(e) => e.stopPropagation()}
                            className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8 relative overflow-hidden"
                        >
                            <button
                                onClick={onClose}
                                className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors"
                                aria-label="Close"
                            >
                                <X className="w-5 h-5" />
                            </button>

                            <div className="text-center space-y-6">
                                <div>
                                    <h2 className="text-xl font-bold text-gray-900 mb-2">
                                        ログイン / 新規登録
                                    </h2>
                                    <p className="text-sm text-gray-500 text-balance">
                                        Googleアカウントを使って、<br />
                                        安全かつ簡単にログインできます。
                                    </p>
                                </div>

                                <button
                                    onClick={handleGoogleLogin}
                                    disabled={isLoading}
                                    className="w-full flex items-center justify-center gap-3 h-12 text-base font-medium bg-white text-gray-700 hover:bg-gray-50 border border-gray-300 shadow-sm transition-all rounded-lg disabled:opacity-70 disabled:cursor-not-allowed"
                                >
                                    {isLoading ? (
                                        <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
                                    ) : (
                                        <GoogleIcon className="w-5 h-5" />
                                    )}
                                    <span>Googleでログイン</span>
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}


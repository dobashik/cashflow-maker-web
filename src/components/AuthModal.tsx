"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Mail, Loader2, MailCheck, AlertTriangle, ArrowRight, RotateCcw } from "lucide-react";
import { Button } from "./ui/Button"; // Assuming Button exists based on Header.tsx
import { login } from "@/app/login/actions";

type AuthModalProps = {
    isOpen: boolean;
    onClose: () => void;
};

export function AuthModal({ isOpen, onClose }: AuthModalProps) {
    const [email, setEmail] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [isSent, setIsSent] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [resendCount, setResendCount] = useState(0);

    // Timer for resend button
    const [canResend, setCanResend] = useState(false);
    const [timeLeft, setTimeLeft] = useState(60);

    useEffect(() => {
        let timer: NodeJS.Timeout;
        if (isSent && !canResend) {
            timer = setInterval(() => {
                setTimeLeft((prev) => {
                    if (prev <= 1) {
                        setCanResend(true);
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
        }
        return () => clearInterval(timer);
    }, [isSent, canResend]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        const formData = new FormData();
        // Verify email logic if needed
        if (!email) {
            setError("メールアドレスを入力してください");
            setIsLoading(false);
            return;
        }

        try {
            const result = await login(email);
            if (result.error) {
                throw new Error(result.error);
            }
            setIsSent(true);
            setCanResend(false);
            setTimeLeft(60);
        } catch (err: any) {
            setError(err.message || "予期せぬエラーが発生しました");
        } finally {
            setIsLoading(false);
        }
    };

    const handleResend = () => {
        // Reset state to allow resending essentially by re-triggering submit logic or just calling API again
        // For UX, we stays on the success screen but trigger the email send again.
        setIsLoading(true);
        login(email)
            .then((result) => {
                if (result.error) throw new Error(result.error);
                // Reset timer
                setCanResend(false);
                setTimeLeft(60);
                setResendCount((prev) => prev + 1);
                // Maybe show a toast or slight indication?
            })
            .catch((err) => setError(err.message))
            .finally(() => setIsLoading(false));
    };

    const resetFlow = () => {
        setIsSent(false);
        setEmail("");
        setError(null);
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
                            className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 relative overflow-hidden"
                        >
                            <button
                                onClick={onClose}
                                className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors"
                                aria-label="Close"
                            >
                                <X className="w-5 h-5" />
                            </button>

                            <div className="mt-2">
                                {!isSent ? (
                                    /* State 1: Input Form */
                                    <form onSubmit={handleSubmit} className="space-y-6">
                                        <div className="text-center">
                                            <h2 className="text-xl font-bold text-gray-900 mb-2">
                                                ポートフォリオ管理版
                                                <br />
                                                Cashflow Makerを始める
                                            </h2>
                                            <p className="text-sm text-gray-500">
                                                メールアドレスを入力してください。
                                                <br />
                                                ログイン用リンクを送信します。
                                            </p>
                                        </div>

                                        <div className="space-y-2">
                                            <label htmlFor="email" className="sr-only">
                                                Email
                                            </label>
                                            <div className="relative">
                                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                                <input
                                                    id="email"
                                                    type="email"
                                                    value={email}
                                                    onChange={(e) => setEmail(e.target.value)}
                                                    placeholder="your@email.com"
                                                    className="w-full pl-10 pr-4 py-3 rounded-lg border border-gray-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none transition-all placeholder:text-gray-300 text-gray-900"
                                                    required
                                                    disabled={isLoading}
                                                />
                                            </div>
                                            {error && (
                                                <p className="text-xs text-red-500 flex items-center gap-1">
                                                    <AlertTriangle className="w-3 h-3" />
                                                    {error}
                                                </p>
                                            )}
                                        </div>

                                        <button
                                            type="submit"
                                            disabled={isLoading}
                                            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-4 rounded-lg shadow-lg shadow-indigo-200 active:transform active:scale-[0.98] transition-all disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                        >
                                            {isLoading ? (
                                                <>
                                                    <Loader2 className="w-5 h-5 animate-spin" />
                                                    送信中...
                                                </>
                                            ) : (
                                                <>
                                                    認証メールを送信
                                                    <ArrowRight className="w-4 h-4" />
                                                </>
                                            )}
                                        </button>

                                        <p className="text-xs text-center text-gray-400 text-balance">
                                            アカウントをお持ちでない場合は自動的に新規登録されます。
                                        </p>
                                    </form>
                                ) : (
                                    /* State 2: Success & Warning */
                                    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                                        <div className="flex flex-col items-center text-center space-y-4">
                                            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-2">
                                                <MailCheck className="w-8 h-8 text-green-600" />
                                            </div>

                                            <h3 className="text-lg font-bold text-gray-900">
                                                メールを送信しました
                                            </h3>

                                            <div className="text-sm text-gray-600 space-y-1">
                                                <p className="font-semibold text-gray-800">{email}</p>
                                                <p>宛にログインリンクを送りました。</p>
                                                <p>メール内のリンクをクリックして完了してください。</p>
                                            </div>
                                        </div>

                                        {/* Warning Box */}
                                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex gap-3 text-left">
                                            <AlertTriangle className="w-5 h-5 text-yellow-600 shrink-0 mt-0.5" />
                                            <div className="text-xs text-yellow-800 leading-relaxed">
                                                <p className="font-bold mb-1">メールが届かない場合</p>
                                                <p>
                                                    <span className="font-semibold border-b border-yellow-500/50">迷惑メールフォルダ</span>や
                                                    <span className="font-semibold border-b border-yellow-500/50">プロモーションタブ</span>
                                                    を必ず確認してください。
                                                </p>
                                            </div>
                                        </div>

                                        <div className="space-y-3 pt-2">
                                            <button
                                                onClick={handleResend}
                                                disabled={!canResend || isLoading}
                                                className="w-full py-2 px-4 rounded-lg text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                            >
                                                {isLoading ? (
                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                ) : (
                                                    <RotateCcw className="w-3.5 h-3.5" />
                                                )}
                                                {canResend
                                                    ? "メールが届きませんか？ 再送信する"
                                                    : `再送信まで ${timeLeft}秒`}
                                            </button>

                                            <button
                                                onClick={() => setIsSent(false)}
                                                className="w-full py-2 text-xs text-indigo-600 hover:text-indigo-800 hover:underline"
                                            >
                                                メールアドレスを修正する
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}

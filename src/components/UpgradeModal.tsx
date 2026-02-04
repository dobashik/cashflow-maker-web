'use client';

/**
 * アップグレードモーダル
 * 
 * - 月額プランの説明
 * - Stripe Checkout への遷移ボタン
 */

import { useState } from 'react';
import { Sparkles, Check, Loader2, X, Shield, Zap, TrendingUp } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/Button";

interface UpgradeModalProps {
    isOpen: boolean;
    onClose: () => void;
    trialDaysRemaining?: number | null;
}

const FEATURES = [
    { icon: TrendingUp, text: 'すべての保有株式データを管理' },
    { icon: Zap, text: '生活費カバー率表示' },
    { icon: Shield, text: 'セクター分析・配当カレンダー' },
    { icon: Sparkles, text: '高配当株分析ツールCSVインポート' },
];

export function UpgradeModal({ isOpen, onClose, trialDaysRemaining }: UpgradeModalProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleUpgrade = async () => {
        setIsLoading(true);
        setError(null);

        try {
            const response = await fetch('/api/stripe/create-checkout', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || '決済画面の準備に失敗しました');
            }

            // Stripe Checkout へリダイレクト
            if (data.url) {
                window.location.href = data.url;
            }
        } catch (err) {
            console.error('[UpgradeModal] Error:', err);
            setError(err instanceof Error ? err.message : '予期せぬエラーが発生しました');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-lg bg-white rounded-3xl overflow-hidden p-0 gap-0">
                {/* ヘッダー */}
                <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-6 text-white relative">
                    <button
                        onClick={onClose}
                        className="absolute top-4 right-4 p-1 rounded-full hover:bg-white/20 transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                    <DialogHeader>
                        <DialogTitle className="text-2xl font-bold flex items-center gap-2 text-white">
                            <Sparkles className="w-6 h-6" />
                            Cashflow Maker Pro
                        </DialogTitle>
                        <DialogDescription className="text-white/90 mt-2 font-medium">
                            無料期間終了後もすべての機能をご利用いただくためには
                        </DialogDescription>
                    </DialogHeader>
                </div>

                {/* コンテンツ */}
                <div className="p-6 space-y-6">
                    {/* 残りトライアル日数の表示 */}
                    {trialDaysRemaining !== null && trialDaysRemaining !== undefined && trialDaysRemaining > 0 && (
                        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
                            <p className="text-emerald-700 font-medium">
                                🎉 残り <span className="text-2xl font-bold">{trialDaysRemaining}</span> 日間の無料期間があります
                            </p>
                            <p className="text-emerald-600 text-sm mt-1">
                                今すぐ登録しても、無料期間終了後に課金が開始されます
                            </p>
                        </div>
                    )}

                    {/* 料金 */}
                    <div className="text-center">
                        <div className="flex items-baseline justify-center gap-1">
                            <span className="text-4xl font-bold text-slate-900">¥480</span>
                            <span className="text-slate-500">/月</span>
                        </div>
                        <p className="text-slate-500 text-sm mt-1">税込・いつでもキャンセル可能</p>
                    </div>

                    {/* 機能リスト */}
                    <div className="space-y-3">
                        {FEATURES.map((feature, index) => (
                            <div key={index} className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                                    <feature.icon className="w-4 h-4 text-indigo-600" />
                                </div>
                                <span className="text-slate-700">{feature.text}</span>
                                <Check className="w-5 h-5 text-emerald-500 ml-auto" />
                            </div>
                        ))}
                    </div>

                    {/* エラー表示 */}
                    {error && (
                        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-center">
                            <p className="text-rose-700 text-sm">{error}</p>
                        </div>
                    )}

                    {/* アクションボタン */}
                    <div className="space-y-3 pt-2">
                        {/* 無料期間中の安心メッセージ */}
                        {trialDaysRemaining !== null && trialDaysRemaining !== undefined && trialDaysRemaining > 0 && (
                            <p className="text-center text-sm text-slate-600 bg-slate-50 rounded-lg py-2 px-3">
                                💳 カード登録しても<span className="font-bold text-indigo-600">無料期間中は課金されません</span>
                            </p>
                        )}
                        <Button
                            onClick={handleUpgrade}
                            disabled={isLoading}
                            className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white py-6 text-lg font-bold rounded-xl shadow-lg shadow-indigo-200 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                                    準備中...
                                </>
                            ) : (
                                <>
                                    <Sparkles className="w-5 h-5 mr-2" />
                                    このまま使い続ける
                                </>
                            )}
                        </Button>
                        <button
                            onClick={onClose}
                            className="w-full text-slate-500 hover:text-slate-700 text-sm py-2 transition-colors"
                        >
                            あとで検討する
                        </button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

'use client';

/**
 * サブスクリプションバナー
 * 
 * - 残り無料日数を表示
 * - VIPユーザーや有料契約者には非表示
 * - 残り日数に応じて色分け
 */

import { useState, useEffect } from 'react';
import { Clock, Crown, Sparkles } from 'lucide-react';
import { checkPremiumAccess, AccessCheckResult } from '@/app/actions/subscriptionActions';

interface SubscriptionBannerProps {
    onUpgradeClick?: () => void;
    onAccessInfoChange?: (trialDaysRemaining: number | null) => void;
}

export function SubscriptionBanner({ onUpgradeClick, onAccessInfoChange }: SubscriptionBannerProps) {
    const [accessInfo, setAccessInfo] = useState<AccessCheckResult | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const loadAccessInfo = async () => {
            try {
                const result = await checkPremiumAccess();
                setAccessInfo(result);
                // 親コンポーネントに残り日数を通知
                if (onAccessInfoChange) {
                    onAccessInfoChange(result.trialDaysRemaining);
                }
            } catch (error) {
                console.error('[SubscriptionBanner] Error:', error);
            } finally {
                setIsLoading(false);
            }
        };

        loadAccessInfo();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ローディング中は何も表示しない
    if (isLoading) {
        return null;
    }

    // アクセス情報がない場合は何も表示しない
    if (!accessInfo) {
        return null;
    }

    // VIPユーザーの場合は特別なバッジを表示
    if (accessInfo.isVip) {
        return (
            <div className="bg-gradient-to-r from-amber-500 to-yellow-400 text-white px-3 py-1.5 rounded-full flex items-center gap-1.5 shadow-lg whitespace-nowrap">
                <Crown className="w-3.5 h-3.5" />
                <span className="text-xs font-bold">VIP</span>
            </div>
        );
    }

    // 有料契約中の場合は何も表示しない（またはプロバッジ）
    if (accessInfo.reason === 'subscribed') {
        return (
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-3 py-1.5 rounded-full flex items-center gap-1.5 shadow-lg whitespace-nowrap">
                <Sparkles className="w-3.5 h-3.5" />
                <span className="text-xs font-bold">Pro</span>
            </div>
        );
    }

    // トライアル期間中の場合
    if (accessInfo.reason === 'trial' && accessInfo.trialDaysRemaining !== null) {
        const days = accessInfo.trialDaysRemaining;

        // 残り日数に応じた色分け
        let bgColor = 'from-emerald-500 to-green-400'; // 30日以上
        let textColor = 'text-white';

        if (days <= 7) {
            bgColor = 'from-rose-500 to-red-400'; // 7日以下
        } else if (days <= 14) {
            bgColor = 'from-amber-500 to-orange-400'; // 14日以下
        } else if (days <= 30) {
            bgColor = 'from-yellow-500 to-amber-400'; // 30日以下
        }

        return (
            <button
                onClick={onUpgradeClick}
                className={`bg-gradient-to-r ${bgColor} ${textColor} px-3 py-1.5 rounded-full flex items-center gap-1.5 shadow-lg hover:scale-105 transition-transform cursor-pointer whitespace-nowrap`}
                title="このまま使い続ける"
            >
                <Clock className="w-3.5 h-3.5" />
                <span className="text-xs font-bold">
                    残り{days}日無料
                </span>
            </button>
        );
    }

    // アクセス権がない場合
    if (!accessInfo.hasAccess) {
        return (
            <button
                onClick={onUpgradeClick}
                className="bg-gradient-to-r from-rose-500 to-red-400 text-white px-3 py-1.5 rounded-full flex items-center gap-1.5 shadow-lg hover:scale-105 transition-transform cursor-pointer animate-pulse whitespace-nowrap"
                title="アップグレード"
            >
                <Clock className="w-3.5 h-3.5" />
                <span className="text-xs font-bold">
                    無料終了
                </span>
            </button>
        );
    }

    return null;
}

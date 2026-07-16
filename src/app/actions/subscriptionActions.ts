'use server';

/**
 * サブスクリプション管理用 Server Actions
 * 
 * - getSubscriptionStatus: 現在のユーザーのサブスクリプション状態を取得
 * - checkPremiumAccess: プレミアム機能へのアクセス権をチェック
 * - getTrialDaysRemaining: 残りトライアル日数を取得
 */

import { createClient } from '@/utils/supabase/server';
import { getAccessContext } from '@/lib/communityAccess';

export type SubscriptionStatus = 'active' | 'inactive' | 'canceled' | 'past_due' | 'trialing';

export interface UserProfile {
    id: string;
    stripe_customer_id: string | null;
    subscription_status: SubscriptionStatus;
    trial_ends_at: string | null;
    is_vip: boolean;
    created_at: string;
    updated_at: string;
}

export interface AccessCheckResult {
    hasAccess: boolean;
    reason: 'vip' | 'trial' | 'subscribed' | 'canceled' | 'no_access';
    trialDaysRemaining: number | null;
    isVip: boolean;
    subscriptionStatus: SubscriptionStatus;
}

/**
 * 現在のユーザーのプロフィール（サブスクリプション情報）を取得
 */
export async function getUserProfile(): Promise<UserProfile | null> {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return null;
    }

    const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

    if (error) {
        console.error('[getUserProfile] Error:', error);
        return null;
    }

    return profile as UserProfile;
}

/**
 * 残りトライアル日数を計算
 */
export async function calculateTrialDaysRemaining(trialEndsAt: string | null): Promise<number | null> {
    if (!trialEndsAt) return null;

    const now = new Date();
    const trialEnd = new Date(trialEndsAt);
    const diffTime = trialEnd.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    return diffDays > 0 ? diffDays : 0;
}

/**
 * プレミアム機能へのアクセス権をチェック
 * 
 * アクセス許可の条件（どれか一つでも当てはまればOK）：
 * 1. VIPフラグがON
 * 2. 無料トライアル期間中
 * 3. サブスクリプションがアクティブ
 */
export async function checkPremiumAccess(): Promise<AccessCheckResult> {
    const [profile, access] = await Promise.all([getUserProfile(), getAccessContext()]);

    if (access.isPlatformOwner) {
        return {
            hasAccess: true,
            reason: 'vip',
            trialDaysRemaining: null,
            isVip: true,
            subscriptionStatus: (profile?.subscription_status as SubscriptionStatus | undefined) ?? 'active'
        };
    }
    if (access.hasAccess) {
        return {
            hasAccess: true,
            reason: 'subscribed',
            trialDaysRemaining: null,
            isVip: false,
            subscriptionStatus: 'active'
        };
    }
    return {
        hasAccess: false,
        reason: 'no_access',
        trialDaysRemaining: 0,
        isVip: false,
        subscriptionStatus: (profile?.subscription_status as SubscriptionStatus | undefined) ?? 'inactive'
    };
}

// 注意: service_role を使う特権処理（updateSubscriptionStatus /
// getUserIdByStripeCustomerId）は、公開 Server Action 化を避けるため
// src/lib/subscriptionAdmin.ts へ移動した。決済 Webhook 等の信頼済み
// サーバー処理からそちらを import して使用すること。

'use server';

/**
 * サブスクリプション管理用 Server Actions
 * 
 * - getSubscriptionStatus: 現在のユーザーのサブスクリプション状態を取得
 * - checkPremiumAccess: プレミアム機能へのアクセス権をチェック
 * - getTrialDaysRemaining: 残りトライアル日数を取得
 */

import { createClient } from '@/utils/supabase/server';

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
    const profile = await getUserProfile();

    // ===== ベータ期間中: 全ログインユーザーにアクセスを許可 =====
    // 決済機能復旧時にこのブロックを削除し、下のコメントアウトを解除すれば元の判定ロジックに戻る
    if (profile) {
        return {
            hasAccess: true,
            reason: 'vip',
            trialDaysRemaining: null,
            isVip: false,
            subscriptionStatus: profile.subscription_status as SubscriptionStatus
        };
    }
    // 未ログインの場合
    return {
        hasAccess: false,
        reason: 'no_access',
        trialDaysRemaining: null,
        isVip: false,
        subscriptionStatus: 'inactive'
    };
    // ===== ベータ期間ここまで =====

    /* === 決済機能復旧時に有効化する判定ロジック ===

    // プロフィールがない場合（未ログインまたはエラー）
    if (!profile) {
        return {
            hasAccess: false,
            reason: 'no_access',
            trialDaysRemaining: null,
            isVip: false,
            subscriptionStatus: 'inactive'
        };
    }

    // 1. VIPチェック（最優先）
    if (profile.is_vip) {
        return {
            hasAccess: true,
            reason: 'vip',
            trialDaysRemaining: null,
            isVip: true,
            subscriptionStatus: profile.subscription_status as SubscriptionStatus
        };
    }

    // 2. サブスクリプションがアクティブ（有料契約中）かチェック
    // ※ trialingは無料トライアル期間中なので、ここではactiveのみ
    if (profile.subscription_status === 'active') {
        return {
            hasAccess: true,
            reason: 'subscribed',
            trialDaysRemaining: null,
            isVip: false,
            subscriptionStatus: profile.subscription_status as SubscriptionStatus
        };
    }

    // 3. トライアル期間チェック（subscription_status が trialing の場合も含む）
    const trialDaysRemaining = await calculateTrialDaysRemaining(profile.trial_ends_at);
    if (trialDaysRemaining !== null && trialDaysRemaining > 0) {
        return {
            hasAccess: true,
            reason: 'trial',
            trialDaysRemaining,
            isVip: false,
            subscriptionStatus: profile.subscription_status as SubscriptionStatus
        };
    }

    // 4. キャンセル済みの場合は再登録を促す
    if (profile.subscription_status === 'canceled') {
        return {
            hasAccess: false,
            reason: 'canceled',
            trialDaysRemaining: 0,
            isVip: false,
            subscriptionStatus: 'canceled'
        };
    }

    // どの条件にも当てはまらない = アクセス不可
    return {
        hasAccess: false,
        reason: 'no_access',
        trialDaysRemaining: 0,
        isVip: false,
        subscriptionStatus: profile.subscription_status as SubscriptionStatus
    };

    === 決済機能復旧時に有効化する判定ロジック ここまで === */
}

/**
 * サブスクリプションステータスを更新（Webhook用、service_roleが必要）
 * 注意: この関数はWebhook APIから呼び出される想定
 */
export async function updateSubscriptionStatus(
    userId: string,
    status: SubscriptionStatus,
    stripeCustomerId?: string
): Promise<{ success: boolean; message: string }> {
    // Note: この関数はWebhookから呼ばれるため、service_roleクライアントを使用
    const { createServiceRoleClient } = await import('@/utils/supabase/service-role');
    const supabase = createServiceRoleClient();

    const updateData: Record<string, unknown> = {
        subscription_status: status,
        updated_at: new Date().toISOString()
    };

    if (stripeCustomerId) {
        updateData.stripe_customer_id = stripeCustomerId;
    }

    const { error } = await supabase
        .from('profiles')
        .update(updateData)
        .eq('id', userId);

    if (error) {
        console.error('[updateSubscriptionStatus] Error:', error);
        return { success: false, message: error.message };
    }

    return { success: true, message: `Subscription status updated to ${status}` };
}

/**
 * Stripe顧客IDでユーザーIDを検索
 */
export async function getUserIdByStripeCustomerId(stripeCustomerId: string): Promise<string | null> {
    const { createServiceRoleClient } = await import('@/utils/supabase/service-role');
    const supabase = createServiceRoleClient();

    const { data, error } = await supabase
        .from('profiles')
        .select('id')
        .eq('stripe_customer_id', stripeCustomerId)
        .single();

    if (error || !data) {
        console.error('[getUserIdByStripeCustomerId] Error:', error);
        return null;
    }

    return data.id;
}

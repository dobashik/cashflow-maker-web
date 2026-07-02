/**
 * サブスクリプション管理の「特権」処理（service_role 使用）
 *
 * ⚠️ セキュリティ注意 ⚠️
 * このモジュールの関数は service_role キーを使い RLS をバイパスして
 * 任意ユーザーの profiles を書き換えます。呼び出し元が指定した userId を
 * そのまま信用するため、**信頼できるサーバー内部からのみ**呼び出すこと。
 *
 * - 決済プロバイダの Webhook から呼ぶ場合は、必ず Webhook の署名検証を
 *   通過した後に呼び出すこと。
 * - このファイルは意図的に 'use server' を付けていない。'use server' にすると
 *   export された各関数が公開の Server Action エンドポイントになり、認証チェック
 *   なしに外部から直接叩けてしまうため（権限昇格の穴になる）。
 */

import { createServiceRoleClient } from '@/utils/supabase/service-role';

export type SubscriptionStatus = 'active' | 'inactive' | 'canceled' | 'past_due' | 'trialing';

/**
 * サブスクリプションステータスを更新（Webhook等の信頼済みサーバー処理専用）
 */
export async function updateSubscriptionStatus(
    userId: string,
    status: SubscriptionStatus,
    stripeCustomerId?: string
): Promise<{ success: boolean; message: string }> {
    const supabase = createServiceRoleClient();

    const updateData: Record<string, unknown> = {
        subscription_status: status,
        updated_at: new Date().toISOString(),
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
 * 決済プロバイダの顧客IDからユーザーIDを検索（Webhook等の信頼済みサーバー処理専用）
 */
export async function getUserIdByStripeCustomerId(stripeCustomerId: string): Promise<string | null> {
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

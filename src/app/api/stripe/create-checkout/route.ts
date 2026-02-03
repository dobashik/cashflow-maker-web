/**
 * Stripe Checkout Session 作成 API (Edge Runtime対応)
 * 
 * Stripe SDKを使わず、fetch APIで直接Stripe APIを呼び出す
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export const runtime = 'edge';

// Stripe APIを直接呼び出すヘルパー関数
async function stripeRequest(endpoint: string, method: string, body?: object) {
    const response = await fetch(`https://api.stripe.com/v1${endpoint}`, {
        method,
        headers: {
            'Authorization': `Bearer ${process.env.STRIPE_SECRET_KEY}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body ? new URLSearchParams(body as Record<string, string>).toString() : undefined,
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error?.message || 'Stripe API error');
    }

    return data;
}

export async function POST(request: Request) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json(
                { error: 'ログインが必要です' },
                { status: 401 }
            );
        }

        // ユーザーのプロフィールを取得
        const { data: profile } = await supabase
            .from('profiles')
            .select('stripe_customer_id, trial_ends_at, is_vip, subscription_status')
            .eq('id', user.id)
            .single();

        // VIPユーザーは決済不要
        if (profile?.is_vip) {
            return NextResponse.json(
                { error: 'VIPユーザーは決済不要です' },
                { status: 400 }
            );
        }

        // 既にアクティブなサブスクリプションがある
        if (profile?.subscription_status === 'active') {
            return NextResponse.json(
                { error: '既に有効なサブスクリプションがあります' },
                { status: 400 }
            );
        }

        // Stripe顧客を取得または作成
        let customerId = profile?.stripe_customer_id;

        if (!customerId) {
            const customer = await stripeRequest('/customers', 'POST', {
                email: user.email || '',
                'metadata[supabase_user_id]': user.id
            });
            customerId = customer.id;

            // プロフィールにStripe顧客IDを保存
            await supabase
                .from('profiles')
                .update({ stripe_customer_id: customerId })
                .eq('id', user.id);
        }

        // 残りトライアル日数を計算
        let trialEnd: number | undefined;
        if (profile?.trial_ends_at) {
            const trialEndsAt = new Date(profile.trial_ends_at);
            const now = new Date();

            // トライアルがまだ残っている場合のみ設定
            if (trialEndsAt > now) {
                // Stripeのtrial_endはUnixタイムスタンプ（秒）
                trialEnd = Math.floor(trialEndsAt.getTime() / 1000);
            }
        }

        // リクエストからorigin取得
        const origin = request.headers.get('origin') || process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

        // Checkout Sessionを作成
        const sessionParams: Record<string, string> = {
            customer: customerId,
            mode: 'subscription',
            'payment_method_types[0]': 'card',
            'line_items[0][price]': process.env.STRIPE_PRICE_ID!,
            'line_items[0][quantity]': '1',
            success_url: `${origin}/?subscription=success`,
            cancel_url: `${origin}/?subscription=canceled`,
            'metadata[supabase_user_id]': user.id,
            'subscription_data[metadata][supabase_user_id]': user.id,
        };

        // 残りトライアル日数がある場合は引き継ぎ
        if (trialEnd) {
            sessionParams['subscription_data[trial_end]'] = trialEnd.toString();
        }

        const session = await stripeRequest('/checkout/sessions', 'POST', sessionParams);

        return NextResponse.json({ url: session.url });

    } catch (error) {
        console.error('[create-checkout] Error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json(
            { error: `チェックアウトセッションの作成に失敗しました: ${errorMessage}` },
            { status: 500 }
        );
    }
}

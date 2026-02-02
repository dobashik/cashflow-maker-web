/**
 * Stripe Checkout Session 作成 API
 * 
 * 残りトライアル日数がある場合、Stripeのtrial_endとして引き継ぎ
 */

import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@/utils/supabase/server';

// Edge Runtimeでは動作しないため、Node.jsランタイムを使用
export const runtime = 'nodejs';

// Stripeクライアントを遅延初期化（ビルド時のエラーを回避）
function getStripe() {
    return new Stripe(process.env.STRIPE_SECRET_KEY!, {
        apiVersion: '2026-01-28.clover'
    });
}

export async function POST(request: Request) {
    try {
        const stripe = getStripe();
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
            const customer = await stripe.customers.create({
                email: user.email,
                metadata: {
                    supabase_user_id: user.id
                }
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
        const sessionParams: Stripe.Checkout.SessionCreateParams = {
            customer: customerId,
            mode: 'subscription',
            payment_method_types: ['card'],
            line_items: [
                {
                    price: process.env.STRIPE_PRICE_ID!,
                    quantity: 1
                }
            ],
            success_url: `${origin}/?subscription=success`,
            cancel_url: `${origin}/?subscription=canceled`,
            metadata: {
                supabase_user_id: user.id
            },
            subscription_data: {
                metadata: {
                    supabase_user_id: user.id
                },
                // 残りトライアル日数がある場合は引き継ぎ
                ...(trialEnd && { trial_end: trialEnd })
            }
        };

        const session = await stripe.checkout.sessions.create(sessionParams);

        return NextResponse.json({ url: session.url });

    } catch (error) {
        console.error('[create-checkout] Error:', error);
        return NextResponse.json(
            { error: 'チェックアウトセッションの作成に失敗しました' },
            { status: 500 }
        );
    }
}

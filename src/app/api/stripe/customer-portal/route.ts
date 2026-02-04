/**
 * Stripe Customer Portal セッション作成 API (Edge Runtime対応)
 * 
 * ユーザーがサブスクリプションを管理（キャンセル、支払い方法変更等）できるポータルへのリンクを生成
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
            .select('stripe_customer_id')
            .eq('id', user.id)
            .single();

        if (!profile?.stripe_customer_id) {
            return NextResponse.json(
                { error: 'サブスクリプション情報が見つかりません' },
                { status: 400 }
            );
        }

        // リクエストからorigin取得
        const origin = request.headers.get('origin') || process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

        // Customer Portal セッションを作成
        const session = await stripeRequest('/billing_portal/sessions', 'POST', {
            customer: profile.stripe_customer_id,
            return_url: origin,
        });

        return NextResponse.json({ url: session.url });

    } catch (error) {
        console.error('[customer-portal] Error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json(
            { error: `ポータルセッションの作成に失敗しました: ${errorMessage}` },
            { status: 500 }
        );
    }
}

/**
 * Stripe Webhook 処理 API (Edge Runtime対応)
 * 
 * Stripe SDKを使わず、fetch APIとWeb Crypto APIで署名検証
 */

import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/utils/supabase/service-role';

export const runtime = 'edge';

// Stripe Webhook署名を検証（Web Crypto API使用）
async function verifyStripeSignature(
    payload: string,
    signature: string,
    secret: string
): Promise<{ verified: boolean; timestamp?: number }> {
    const parts = signature.split(',');
    let timestamp: string | undefined;
    let v1Signature: string | undefined;

    for (const part of parts) {
        const [key, value] = part.split('=');
        if (key === 't') timestamp = value;
        if (key === 'v1') v1Signature = value;
    }

    if (!timestamp || !v1Signature) {
        return { verified: false };
    }

    // タイムスタンプが5分以内か確認
    const timestampNum = parseInt(timestamp, 10);
    const currentTime = Math.floor(Date.now() / 1000);
    if (Math.abs(currentTime - timestampNum) > 300) {
        return { verified: false };
    }

    // 署名を計算
    const signedPayload = `${timestamp}.${payload}`;
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );
    const signatureBuffer = await crypto.subtle.sign(
        'HMAC',
        key,
        encoder.encode(signedPayload)
    );

    // バイト配列を16進数文字列に変換
    const expectedSignature = Array.from(new Uint8Array(signatureBuffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

    // タイミング攻撃を防ぐための比較
    const verified = expectedSignature === v1Signature;

    return { verified, timestamp: timestampNum };
}

// イベントデータの型定義
interface StripeEvent {
    id: string;
    type: string;
    data: {
        object: {
            id: string;
            customer?: string;
            status?: string;
            metadata?: {
                supabase_user_id?: string;
            };
        };
    };
}

export async function POST(request: Request) {
    const body = await request.text();
    const signature = request.headers.get('stripe-signature');

    if (!signature) {
        console.error('[webhook] Missing stripe-signature header');
        return NextResponse.json(
            { error: 'Missing stripe-signature header' },
            { status: 400 }
        );
    }

    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
        console.error('[webhook] STRIPE_WEBHOOK_SECRET not configured');
        return NextResponse.json(
            { error: 'Webhook secret not configured' },
            { status: 500 }
        );
    }

    // 署名を検証
    const { verified } = await verifyStripeSignature(body, signature, webhookSecret);

    if (!verified) {
        console.error('[webhook] Signature verification failed');
        return NextResponse.json(
            { error: 'Webhook signature verification failed' },
            { status: 400 }
        );
    }

    let event: StripeEvent;
    try {
        event = JSON.parse(body);
    } catch {
        console.error('[webhook] Invalid JSON');
        return NextResponse.json(
            { error: 'Invalid JSON' },
            { status: 400 }
        );
    }

    const supabase = createServiceRoleClient();

    try {
        switch (event.type) {
            case 'checkout.session.completed': {
                const session = event.data.object;
                console.log('[webhook] checkout.session.completed:', session.id);

                // metadataからSupabaseユーザーIDを取得
                const userId = session.metadata?.supabase_user_id;
                const customerId = session.customer;

                if (userId && customerId) {
                    // サブスクリプションステータスを更新
                    const { error } = await supabase
                        .from('profiles')
                        .update({
                            subscription_status: 'active',
                            stripe_customer_id: customerId,
                            updated_at: new Date().toISOString()
                        })
                        .eq('id', userId);

                    if (error) {
                        console.error('[webhook] Failed to update profile:', error);
                    } else {
                        console.log('[webhook] Profile updated for user:', userId);
                    }
                }
                break;
            }

            case 'customer.subscription.updated': {
                const subscription = event.data.object;
                console.log('[webhook] customer.subscription.updated:', subscription.id);

                const customerId = subscription.customer;

                if (customerId) {
                    // 顧客IDからユーザーを検索
                    const { data: profile } = await supabase
                        .from('profiles')
                        .select('id')
                        .eq('stripe_customer_id', customerId)
                        .single();

                    if (profile) {
                        // Stripeのステータスをアプリ用にマッピング
                        let status: string;
                        switch (subscription.status) {
                            case 'active':
                                status = 'active';
                                break;
                            case 'trialing':
                                status = 'trialing';
                                break;
                            case 'past_due':
                                status = 'past_due';
                                break;
                            case 'canceled':
                            case 'unpaid':
                                status = 'canceled';
                                break;
                            default:
                                status = 'inactive';
                        }

                        const { error } = await supabase
                            .from('profiles')
                            .update({
                                subscription_status: status,
                                updated_at: new Date().toISOString()
                            })
                            .eq('id', profile.id);

                        if (error) {
                            console.error('[webhook] Failed to update subscription status:', error);
                        } else {
                            console.log('[webhook] Subscription status updated to:', status);
                        }
                    }
                }
                break;
            }

            case 'customer.subscription.deleted': {
                const subscription = event.data.object;
                console.log('[webhook] customer.subscription.deleted:', subscription.id);

                const customerId = subscription.customer;

                if (customerId) {
                    // 顧客IDからユーザーを検索
                    const { data: profile } = await supabase
                        .from('profiles')
                        .select('id')
                        .eq('stripe_customer_id', customerId)
                        .single();

                    if (profile) {
                        const { error } = await supabase
                            .from('profiles')
                            .update({
                                subscription_status: 'canceled',
                                updated_at: new Date().toISOString()
                            })
                            .eq('id', profile.id);

                        if (error) {
                            console.error('[webhook] Failed to update canceled status:', error);
                        } else {
                            console.log('[webhook] Subscription canceled for user:', profile.id);
                        }
                    }
                }
                break;
            }

            case 'invoice.payment_failed': {
                const invoice = event.data.object;
                console.log('[webhook] invoice.payment_failed:', invoice.id);

                const customerId = invoice.customer;

                if (customerId) {
                    // 顧客IDからユーザーを検索
                    const { data: profile } = await supabase
                        .from('profiles')
                        .select('id')
                        .eq('stripe_customer_id', customerId)
                        .single();

                    if (profile) {
                        const { error } = await supabase
                            .from('profiles')
                            .update({
                                subscription_status: 'past_due',
                                updated_at: new Date().toISOString()
                            })
                            .eq('id', profile.id);

                        if (error) {
                            console.error('[webhook] Failed to update past_due status:', error);
                        } else {
                            console.log('[webhook] Status set to past_due for user:', profile.id);
                        }
                    }
                }
                break;
            }

            default:
                console.log('[webhook] Unhandled event type:', event.type);
        }

        return NextResponse.json({ received: true });

    } catch (error) {
        console.error('[webhook] Error processing event:', error);
        return NextResponse.json(
            { error: 'Webhook processing failed' },
            { status: 500 }
        );
    }
}

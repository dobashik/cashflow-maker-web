/**
 * Stripe Webhook 処理 API
 * 
 * 以下のイベントを処理:
 * - checkout.session.completed: 決済完了時
 * - customer.subscription.updated: サブスクリプション更新時
 * - customer.subscription.deleted: サブスクリプション解約時
 * - invoice.payment_failed: 支払い失敗時
 */

import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createServiceRoleClient } from '@/utils/supabase/service-role';

// Edge Runtimeでは動作しないため、Node.jsランタイムを使用
export const runtime = 'nodejs';

// Stripeクライアントを遅延初期化（ビルド時のエラーを回避）
function getStripe() {
    return new Stripe(process.env.STRIPE_SECRET_KEY!, {
        apiVersion: '2026-01-28.clover'
    });
}

function getWebhookSecret() {
    return process.env.STRIPE_WEBHOOK_SECRET!;
}

export async function POST(request: Request) {
    const stripe = getStripe();
    const webhookSecret = getWebhookSecret();
    const body = await request.text();
    const signature = request.headers.get('stripe-signature');

    if (!signature) {
        console.error('[webhook] Missing stripe-signature header');
        return NextResponse.json(
            { error: 'Missing stripe-signature header' },
            { status: 400 }
        );
    }

    let event: Stripe.Event;

    try {
        event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err) {
        console.error('[webhook] Signature verification failed:', err);
        return NextResponse.json(
            { error: 'Webhook signature verification failed' },
            { status: 400 }
        );
    }

    const supabase = createServiceRoleClient();

    try {
        switch (event.type) {
            case 'checkout.session.completed': {
                const session = event.data.object as Stripe.Checkout.Session;
                console.log('[webhook] checkout.session.completed:', session.id);

                // metadataからSupabaseユーザーIDを取得
                const userId = session.metadata?.supabase_user_id;
                const customerId = session.customer as string;

                if (userId) {
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
                const subscription = event.data.object as Stripe.Subscription;
                console.log('[webhook] customer.subscription.updated:', subscription.id);

                const customerId = subscription.customer as string;

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
                break;
            }

            case 'customer.subscription.deleted': {
                const subscription = event.data.object as Stripe.Subscription;
                console.log('[webhook] customer.subscription.deleted:', subscription.id);

                const customerId = subscription.customer as string;

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
                break;
            }

            case 'invoice.payment_failed': {
                const invoice = event.data.object as Stripe.Invoice;
                console.log('[webhook] invoice.payment_failed:', invoice.id);

                const customerId = invoice.customer as string;

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

'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function TokushohoPage() {
    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-indigo-50 to-purple-50">
            <div className="container mx-auto px-4 py-12 max-w-3xl">
                {/* 戻るリンク */}
                <Link 
                    href="/" 
                    className="inline-flex items-center gap-2 text-indigo-600 hover:text-indigo-800 mb-8 transition-colors"
                >
                    <ArrowLeft className="w-4 h-4" />
                    トップページに戻る
                </Link>

                <div className="bg-white rounded-2xl shadow-sm border border-indigo-100 p-8 md:p-12">
                    <h1 className="text-2xl md:text-3xl font-bold text-indigo-900 mb-8">
                        特定商取引法に基づく表記
                    </h1>

                    <div className="space-y-6">
                        <div className="border-b border-slate-100 pb-4">
                            <h2 className="text-sm font-bold text-slate-500 mb-1">販売業者名</h2>
                            <p className="text-slate-900">トイズファミリー</p>
                        </div>

                        <div className="border-b border-slate-100 pb-4">
                            <h2 className="text-sm font-bold text-slate-500 mb-1">代表責任者</h2>
                            <p className="text-slate-900">土橋 健太郎</p>
                        </div>

                        <div className="border-b border-slate-100 pb-4">
                            <h2 className="text-sm font-bold text-slate-500 mb-1">所在地</h2>
                            <p className="text-slate-900">
                                〒107-0062<br />
                                東京都港区南青山3丁目1番36号青山丸竹ビル6F
                            </p>
                        </div>

                        <div className="border-b border-slate-100 pb-4">
                            <h2 className="text-sm font-bold text-slate-500 mb-1">電話番号</h2>
                            <p className="text-slate-900">080-6078-3868</p>
                        </div>

                        <div className="border-b border-slate-100 pb-4">
                            <h2 className="text-sm font-bold text-slate-500 mb-1">メールアドレス</h2>
                            <p className="text-slate-900">
                                <a href="mailto:dobashi@shambalalife.net" className="text-indigo-600 hover:text-indigo-800">
                                    dobashi@shambalalife.net
                                </a>
                            </p>
                        </div>

                        <div className="border-b border-slate-100 pb-4">
                            <h2 className="text-sm font-bold text-slate-500 mb-1">販売価格</h2>
                            <p className="text-slate-900">月額 480円（税込）</p>
                        </div>

                        <div className="border-b border-slate-100 pb-4">
                            <h2 className="text-sm font-bold text-slate-500 mb-1">代金の支払時期</h2>
                            <p className="text-slate-900">無料期間終了後</p>
                        </div>

                        <div className="border-b border-slate-100 pb-4">
                            <h2 className="text-sm font-bold text-slate-500 mb-1">支払方法</h2>
                            <p className="text-slate-900">クレジットカード（Stripe）</p>
                        </div>

                        <div className="border-b border-slate-100 pb-4">
                            <h2 className="text-sm font-bold text-slate-500 mb-1">商品の引き渡し時期</h2>
                            <p className="text-slate-900">決済完了後、直ちにご利用いただけます</p>
                        </div>

                        <div className="pb-4">
                            <h2 className="text-sm font-bold text-slate-500 mb-1">返品・交換・キャンセル</h2>
                            <p className="text-slate-900">
                                デジタルコンテンツの特性上、返品はお受けしておりません。<br />
                                サブスクリプションの解約はいつでも可能です。解約後も、お支払い済みの期間終了まではサービスをご利用いただけます。
                            </p>
                        </div>
                    </div>
                </div>

                <p className="text-center text-sm text-slate-400 mt-8">
                    © {new Date().getFullYear()} Cashflow Maker. All rights reserved.
                </p>
            </div>
        </div>
    );
}

'use client';

import { useState } from 'react';
import { Info, X } from 'lucide-react';

export function BetaNoticeBanner() {
    const [isDismissed, setIsDismissed] = useState(false);

    if (isDismissed) return null;

    return (
        <div className="w-full bg-gradient-to-r from-sky-50 via-blue-50 to-amber-50 border-b border-sky-200/60">
            <div className="container mx-auto px-4 py-3 relative">
                <div className="flex items-start gap-3 pr-8">
                    <div className="flex-shrink-0 mt-0.5">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-sky-400 to-blue-500 flex items-center justify-center shadow-sm">
                            <Info className="w-4 h-4 text-white" />
                        </div>
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-sky-800 mb-1">
                            【重要なお知らせ：ベータ版運用について】
                        </p>
                        <p className="text-sm text-slate-700 leading-relaxed">
                            本サービスは現在、一時的に決済機能を停止し、すべての機能を期間の制限なく
                            <span className="font-bold text-sky-700">無料</span>
                            で開放しております。
                            <span className="text-slate-500">（クレジットカード登録不要）</span>
                        </p>
                    </div>
                </div>
                <button
                    onClick={() => setIsDismissed(true)}
                    className="absolute top-3 right-4 p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-white/60 transition-colors"
                    aria-label="閉じる"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
}

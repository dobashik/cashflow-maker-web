"use client";

import Link from 'next/link';
import { LogOut, ShieldAlert } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';

export function AccessPending({ message }: { message?: string }) {
    const logout = async () => {
        await createClient().auth.signOut();
        window.location.href = '/';
    };

    return (
        <main className="grid min-h-screen place-items-center bg-slate-50 px-4">
            <div className="w-full max-w-lg rounded-3xl border border-amber-200 bg-white p-8 text-center shadow-xl">
                <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-2xl bg-amber-100 text-amber-700">
                    <ShieldAlert className="h-8 w-8" />
                </div>
                <h1 className="text-2xl font-black text-slate-900">利用権限を確認できません</h1>
                <p className="mt-4 leading-7 text-slate-600">
                    {message || 'このGoogleアカウントには、有効なコミュニティ利用権限がありません。'}
                </p>
                <p className="mt-3 text-sm leading-6 text-slate-500">
                    コミュニティ代表者に登録メールアドレスと利用期限をご確認ください。
                </p>
                <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
                    <Link href="/join" className="rounded-xl bg-indigo-600 px-5 py-3 font-bold text-white hover:bg-indigo-700">
                        招待コードを入力する
                    </Link>
                    <button onClick={logout} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 px-5 py-3 font-bold text-slate-600 hover:bg-slate-50">
                        <LogOut className="h-4 w-4" />ログアウト
                    </button>
                </div>
            </div>
        </main>
    );
}

"use client";

import { useState } from 'react';
import Link from 'next/link';
import { KeyRound, Loader2, ShieldCheck } from 'lucide-react';

import { beginInvitationRegistration } from '@/app/actions/communityActions';
import { createClient } from '@/utils/supabase/client';
import { GoogleIcon } from '@/components/ui/icons';

export function JoinCommunityForm() {
    const [code, setCode] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const handleJoin = async (event: React.FormEvent) => {
        event.preventDefault();
        setIsLoading(true);
        setError('');
        try {
            const result = await beginInvitationRegistration(code);
            if (!result.success) {
                setError(result.message);
                return;
            }
            const supabase = createClient();
            const { error: oauthError } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: { redirectTo: `${window.location.origin}/auth/callback?next=/` },
            });
            if (oauthError) setError(oauthError.message);
        } catch (joinError) {
            setError(joinError instanceof Error ? joinError.message : '登録を開始できませんでした');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="w-full max-w-md rounded-3xl border border-indigo-100 bg-white p-8 shadow-xl shadow-indigo-100/60">
            <div className="mb-7 text-center">
                <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-indigo-600 text-white">
                    <KeyRound className="h-7 w-7" />
                </div>
                <h1 className="text-2xl font-black text-slate-900">コミュニティへ参加</h1>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                    コミュニティから案内された共通コードと、登録済みのGoogleメールアドレスが必要です。
                </p>
            </div>

            <form onSubmit={handleJoin} className="space-y-5">
                <label className="block">
                    <span className="mb-2 block text-sm font-bold text-slate-700">招待コード</span>
                    <input
                        value={code}
                        onChange={(event) => setCode(event.target.value.toUpperCase())}
                        placeholder="CFM-COMMUNITY-MEMBER-..."
                        autoComplete="off"
                        required
                        className="h-12 w-full rounded-xl border border-slate-300 px-4 font-mono text-sm uppercase text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
                    />
                </label>

                {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>}

                <button
                    type="submit"
                    disabled={isLoading || code.trim().length < 10}
                    className="flex h-12 w-full items-center justify-center gap-3 rounded-xl bg-indigo-600 font-bold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                    {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <GoogleIcon className="h-5 w-5" />}
                    コードを確認してGoogleで登録
                </button>
            </form>

            <div className="mt-6 flex items-start gap-2 rounded-xl bg-emerald-50 p-3 text-xs leading-5 text-emerald-800">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                代表者も他会員のポートフォリオ、資産額、CSV内容を見ることはできません。
            </div>
            <p className="mt-6 text-center text-sm text-slate-500">
                登録済みの方は <Link href="/" className="font-bold text-indigo-600 hover:underline">通常ログイン</Link>
            </p>
        </div>
    );
}

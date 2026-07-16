"use client";

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CalendarClock, Copy, Plus, ShieldCheck, StopCircle, Users } from 'lucide-react';

import {
    activateCommunityPoc,
    createCommunity,
    endCommunityAccess,
    extendCommunityAccess,
    type ManagedCommunity,
} from '@/app/actions/communityActions';

function formatDate(value: string | null) {
    if (!value) return '未設定';
    return new Date(value).toLocaleString('ja-JP');
}

export function OwnerAdminPanel({ communities }: { communities: ManagedCommunity[] }) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [message, setMessage] = useState('');
    const [generatedCodes, setGeneratedCodes] = useState<{ admin: string; member: string } | null>(null);
    const [form, setForm] = useState({ name: '', representativeEmail: '', maxMembers: '100' });

    const run = (task: () => Promise<{ success: boolean; message: string }>) => {
        startTransition(async () => {
            const result = await task();
            setMessage(result.message);
            router.refresh();
        });
    };

    const submitCreate = (event: React.FormEvent) => {
        event.preventDefault();
        startTransition(async () => {
            const result = await createCommunity({
                name: form.name,
                representativeEmail: form.representativeEmail,
                maxMembers: Number(form.maxMembers),
            });
            setMessage(result.message);
            if (result.success && result.data) {
                setGeneratedCodes({ admin: result.data.adminInviteCode, member: result.data.memberInviteCode });
                setForm({ name: '', representativeEmail: '', maxMembers: '100' });
            }
            router.refresh();
        });
    };

    return (
        <main className="min-h-screen bg-slate-50 px-4 py-10">
            <div className="mx-auto max-w-6xl space-y-8">
                <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
                    <div>
                        <p className="text-sm font-bold text-indigo-600">PLATFORM OWNER</p>
                        <h1 className="mt-1 text-3xl font-black text-slate-900">コミュニティ管理</h1>
                        <p className="mt-2 text-slate-500">契約・期限・定員・招待だけを管理します。会員の投資情報は表示されません。</p>
                    </div>
                    <div className="flex gap-3">
                        <Link href="/community-admin" className="rounded-xl border border-indigo-200 bg-white px-4 py-2 font-bold text-indigo-700">会員管理</Link>
                        <Link href="/" className="rounded-xl bg-indigo-600 px-4 py-2 font-bold text-white">自分のポートフォリオ</Link>
                    </div>
                </header>

                {message && <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 font-bold text-indigo-800">{message}</div>}

                <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                    <div className="mb-5 flex items-center gap-3">
                        <div className="rounded-xl bg-indigo-100 p-2 text-indigo-700"><Plus className="h-5 w-5" /></div>
                        <div><h2 className="text-xl font-black text-slate-900">新しいコミュニティ</h2><p className="text-sm text-slate-500">代表者は初回ログインから14日間体験できます。</p></div>
                    </div>
                    <form onSubmit={submitCreate} className="grid gap-4 md:grid-cols-[1.2fr_1.2fr_150px_auto]">
                        <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="コミュニティ名" className="h-12 rounded-xl border border-slate-300 px-4 text-slate-900" />
                        <input required type="email" value={form.representativeEmail} onChange={(e) => setForm({ ...form, representativeEmail: e.target.value })} placeholder="代表者のGoogleメール" className="h-12 rounded-xl border border-slate-300 px-4 text-slate-900" />
                        <input required type="number" min="2" max="200" value={form.maxMembers} onChange={(e) => setForm({ ...form, maxMembers: e.target.value })} className="h-12 rounded-xl border border-slate-300 px-4 text-slate-900" />
                        <button disabled={isPending} className="h-12 rounded-xl bg-indigo-600 px-6 font-bold text-white disabled:opacity-60">作成</button>
                    </form>

                    {generatedCodes && (
                        <div className="mt-5 grid gap-3 rounded-2xl bg-emerald-50 p-5 text-sm text-emerald-900 md:grid-cols-2">
                            <CodeBox label="代表者用（1回・14日以内）" code={generatedCodes.admin} />
                            <CodeBox label="会員共通コード（PoC開始まで無効）" code={generatedCodes.member} />
                        </div>
                    )}
                </section>

                <section className="space-y-4">
                    {communities.length === 0 && <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center text-slate-500">コミュニティはまだありません。</div>}
                    {communities.map((community) => (
                        <article key={community.id} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                            <div className="flex flex-col justify-between gap-4 lg:flex-row">
                                <div>
                                    <div className="flex flex-wrap items-center gap-3">
                                        <h2 className="text-xl font-black text-slate-900">{community.name}</h2>
                                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black uppercase text-slate-600">{community.status}</span>
                                    </div>
                                    <p className="mt-2 text-sm text-slate-500">代表者: {community.representativeEmail ?? '未設定'}</p>
                                </div>
                                <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                                    <Stat icon={<Users className="h-4 w-4" />} label="有効 / 定員" value={`${community.activeCount} / ${community.maxMembers}`} />
                                    <Stat icon={<ShieldCheck className="h-4 w-4" />} label="招待済み" value={`${community.invitedCount}名`} />
                                    <Stat icon={<CalendarClock className="h-4 w-4" />} label="利用期限" value={formatDate(community.accessExpiresAt)} />
                                </div>
                            </div>

                            <div className="mt-5 rounded-2xl bg-slate-50 p-4">
                                <p className="text-xs font-bold text-slate-500">会員共通コード</p>
                                <div className="mt-1 flex flex-wrap items-center gap-2">
                                    <code className="break-all font-bold text-slate-800">{community.memberInviteCode ?? '未発行'}</code>
                                    <span className={`rounded-full px-2 py-1 text-xs font-bold ${community.memberInviteActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>{community.memberInviteActive ? '有効' : '無効'}</span>
                                </div>
                            </div>

                            <div className="mt-5 flex flex-wrap gap-2">
                                <button disabled={isPending} onClick={() => run(() => activateCommunityPoc(community.id))} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white">PoCを3か月開始</button>
                                {[1, 3, 12].map((months) => (
                                    <button key={months} disabled={isPending} onClick={() => run(() => extendCommunityAccess(community.id, months as 1 | 3 | 12))} className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-bold text-indigo-700">+{months}か月</button>
                                ))}
                                <Link href={`/community-admin?community=${community.id}`} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700">会員を管理</Link>
                                <button disabled={isPending || community.status === 'ended'} onClick={() => confirm('コミュニティ全体を停止しますか？') && run(() => endCommunityAccess(community.id))} className="ml-auto inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-bold text-red-700"><StopCircle className="h-4 w-4" />契約終了</button>
                            </div>
                        </article>
                    ))}
                </section>
            </div>
        </main>
    );
}

function CodeBox({ label, code }: { label: string; code: string }) {
    return <div><p className="font-bold">{label}</p><div className="mt-1 flex items-center gap-2"><code className="break-all">{code}</code><button type="button" onClick={() => navigator.clipboard.writeText(code)} aria-label="コピー"><Copy className="h-4 w-4" /></button></div></div>;
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
    return <div className="rounded-xl bg-slate-50 p-3"><div className="flex items-center gap-1 text-xs font-bold text-slate-500">{icon}{label}</div><p className="mt-1 font-black text-slate-800">{value}</p></div>;
}

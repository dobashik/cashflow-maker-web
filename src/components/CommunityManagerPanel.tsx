"use client";

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Copy, FileUp, KeyRound, RotateCcw, UserMinus, UserPlus } from 'lucide-react';

import {
    addCommunityMembers,
    restoreCommunityMember,
    revokeCommunityMember,
    rotateMemberInviteCode,
    type ManagedCommunity,
} from '@/app/actions/communityActions';

function emailCount(value: string) {
    return new Set(value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)?.map((email) => email.toLowerCase()) ?? []).size;
}

export function CommunityManagerPanel({
    communities,
    selectedCommunityId,
    isPlatformOwner,
}: {
    communities: ManagedCommunity[];
    selectedCommunityId?: string;
    isPlatformOwner: boolean;
}) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [message, setMessage] = useState('');
    const [rawEmails, setRawEmails] = useState('');
    const selected = communities.find((community) => community.id === selectedCommunityId) ?? communities[0];
    const count = useMemo(() => emailCount(rawEmails), [rawEmails]);

    const run = (task: () => Promise<{ success: boolean; message: string }>) => {
        startTransition(async () => {
            const result = await task();
            setMessage(result.message);
            router.refresh();
        });
    };

    const addMembers = () => {
        if (!selected) return;
        startTransition(async () => {
            const result = await addCommunityMembers(selected.id, rawEmails);
            setMessage(result.message);
            if (result.success) setRawEmails('');
            router.refresh();
        });
    };

    const loadFile = async (file?: File) => {
        if (!file) return;
        if (file.size > 1024 * 1024) {
            setMessage('CSV/TXTファイルは1MB以下にしてください');
            return;
        }
        setRawEmails(await file.text());
    };

    if (!selected) {
        return <main className="grid min-h-screen place-items-center bg-slate-50 p-6"><div className="text-center"><p className="text-slate-600">管理できるコミュニティがありません。</p><Link href="/" className="mt-4 inline-block font-bold text-indigo-600">ポートフォリオへ戻る</Link></div></main>;
    }

    return (
        <main className="min-h-screen bg-slate-50 px-4 py-10">
            <div className="mx-auto max-w-6xl space-y-7">
                <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
                    <div><p className="text-sm font-bold text-indigo-600">COMMUNITY ADMIN</p><h1 className="mt-1 text-3xl font-black text-slate-900">{selected.name}</h1><p className="mt-2 text-slate-500">会員メールと利用権限だけを管理します。投資情報は表示されません。</p></div>
                    <div className="flex gap-3">{isPlatformOwner && <Link href="/admin" className="rounded-xl border border-indigo-200 bg-white px-4 py-2 font-bold text-indigo-700">全体管理</Link>}<Link href="/" className="rounded-xl bg-indigo-600 px-4 py-2 font-bold text-white">自分のポートフォリオ</Link></div>
                </header>

                {communities.length > 1 && <nav className="flex flex-wrap gap-2">{communities.map((community) => <Link key={community.id} href={`/community-admin?community=${community.id}`} className={`rounded-full px-4 py-2 text-sm font-bold ${community.id === selected.id ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600'}`}>{community.name}</Link>)}</nav>}
                {message && <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 font-bold text-indigo-800">{message}</div>}

                <section className="grid gap-4 md:grid-cols-3">
                    <Metric label="有効会員" value={`${selected.activeCount}名`} />
                    <Metric label="登録待ち" value={`${selected.invitedCount}名`} />
                    <Metric label="定員" value={`${selected.maxMembers}名`} />
                </section>

                <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                        <div><h2 className="flex items-center gap-2 text-xl font-black text-slate-900"><KeyRound className="h-5 w-5 text-indigo-600" />会員共通コード</h2><p className="mt-1 text-sm text-slate-500">登録済みメールの会員だけが、このコードでGoogle登録できます。</p></div>
                        <button disabled={isPending} onClick={() => run(() => rotateMemberInviteCode(selected.id))} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700"><RotateCcw className="h-4 w-4" />再発行</button>
                    </div>
                    <div className="mt-4 flex items-center gap-3 rounded-xl bg-slate-50 p-4">
                        <code className="min-w-0 flex-1 break-all font-bold text-slate-800">{selected.memberInviteCode ?? '未発行'}</code>
                        {selected.memberInviteCode && <button onClick={() => navigator.clipboard.writeText(selected.memberInviteCode!)} className="rounded-lg bg-white p-2 text-indigo-600 shadow"><Copy className="h-4 w-4" /></button>}
                    </div>
                </section>

                <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                    <h2 className="flex items-center gap-2 text-xl font-black text-slate-900"><UserPlus className="h-5 w-5 text-emerald-600" />会員メールを一括登録</h2>
                    <p className="mt-2 text-sm leading-6 text-slate-500">メール一覧をそのまま貼り付けるか、メール列を含むCSV/TXTを選んでください。重複や他の列は自動で除外します。</p>
                    <textarea value={rawEmails} onChange={(e) => setRawEmails(e.target.value)} rows={8} placeholder={'member1@example.com\nmember2@example.com\nmember3@example.com'} className="mt-4 w-full rounded-2xl border border-slate-300 p-4 font-mono text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100" />
                    <div className="mt-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                        <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700"><FileUp className="h-4 w-4" />CSV/TXTを選ぶ<input type="file" accept=".csv,.txt,text/csv,text/plain" className="hidden" onChange={(e) => loadFile(e.target.files?.[0])} /></label>
                        <div className="flex items-center gap-3"><span className="text-sm font-bold text-slate-500">検出 {count}件</span><button disabled={isPending || count === 0} onClick={addMembers} className="rounded-xl bg-emerald-600 px-5 py-2.5 font-bold text-white disabled:opacity-50">一括登録</button></div>
                    </div>
                </section>

                <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                    <div className="border-b border-slate-200 p-6"><h2 className="text-xl font-black text-slate-900">会員一覧</h2><p className="mt-1 text-sm text-slate-500">代表者を含む登録メール一覧です。資産情報は取得・表示しません。</p></div>
                    <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-5 py-3">メール</th><th className="px-5 py-3">役割</th><th className="px-5 py-3">状態</th><th className="px-5 py-3">期限</th><th className="px-5 py-3">操作</th></tr></thead><tbody className="divide-y divide-slate-100">{selected.members?.map((member) => <tr key={member.id}><td className="px-5 py-4 font-medium text-slate-800">{member.email}</td><td className="px-5 py-4">{member.role === 'admin' ? '代表者' : '会員'}</td><td className="px-5 py-4"><span className={`rounded-full px-2 py-1 text-xs font-bold ${member.status === 'active' ? 'bg-emerald-100 text-emerald-700' : member.status === 'invited' ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'}`}>{member.status}</span></td><td className="px-5 py-4 text-slate-500">{member.accessExpiresAt ? new Date(member.accessExpiresAt).toLocaleDateString('ja-JP') : '未設定'}</td><td className="px-5 py-4">{member.role !== 'admin' && (['revoked', 'expired'].includes(member.status) ? <button disabled={isPending} onClick={() => run(() => restoreCommunityMember(selected.id, member.id))} className="font-bold text-indigo-600">復旧</button> : <button disabled={isPending} onClick={() => confirm(`${member.email} の利用を停止しますか？`) && run(() => revokeCommunityMember(selected.id, member.id))} className="inline-flex items-center gap-1 font-bold text-red-600"><UserMinus className="h-4 w-4" />停止</button>)}</td></tr>)}</tbody></table></div>
                </section>
            </div>
        </main>
    );
}

function Metric({ label, value }: { label: string; value: string }) {
    return <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm font-bold text-slate-500">{label}</p><p className="mt-1 text-2xl font-black text-slate-900">{value}</p></div>;
}

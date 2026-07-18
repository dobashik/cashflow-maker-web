"use client";

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CalendarClock, Check, Copy, Plus, RotateCcw, ShieldCheck, StopCircle, Trash2, Users } from 'lucide-react';

import {
    activateCommunityPoc,
    createCommunity,
    deleteUnusedTrialCommunity,
    endCommunityAccess,
    extendCommunityAccess,
    forceDeleteCommunity,
    rotateRepresentativeInviteCode,
    updateCommunityCapacity,
    type ManagedCommunity,
} from '@/app/actions/communityActions';

function formatDate(value: string | null) {
    if (!value) return '未設定';
    return new Date(value).toLocaleString('ja-JP');
}

function isFuture(value: string | null) {
    return Boolean(value && new Date(value).getTime() > Date.now());
}

function communityStatusLabel(community: ManagedCommunity) {
    if (community.status === 'ended') return '契約終了';
    if (community.status === 'active') return '継続利用中';
    if (community.status === 'poc') return '3か月利用中';
    if (community.accessStartsAt) return '代表者お試し利用中';
    return '代表者登録待ち';
}

export function OwnerAdminPanel({ communities }: { communities: ManagedCommunity[] }) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [message, setMessage] = useState('');
    const [generatedCodes, setGeneratedCodes] = useState<{ admin: string; member: string } | null>(null);
    const [form, setForm] = useState({ name: '', representativeEmail: '', maxMembers: '100' });
    const [copiedCode, setCopiedCode] = useState<string | null>(null);
    const [confirmation, setConfirmation] = useState<{
        title: string;
        description: string;
        confirmLabel: string;
        action: () => Promise<{ success: boolean; message: string }>;
    } | null>(null);
    const [restartCommunity, setRestartCommunity] = useState<ManagedCommunity | null>(null);

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

    const copyCode = async (id: string, code: string) => {
        try {
            await navigator.clipboard.writeText(code);
            setCopiedCode(id);
            window.setTimeout(() => setCopiedCode((current) => current === id ? null : current), 2200);
        } catch {
            setMessage('コピーに失敗しました。コードを選択してコピーしてください。');
        }
    };

    const requestConfirmation = (next: NonNullable<typeof confirmation>) => setConfirmation(next);

    const confirmAction = () => {
        if (!confirmation) return;
        const action = confirmation.action;
        setConfirmation(null);
        run(action);
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
                            <CodeBox id="new-admin" label="代表者用（1回・14日以内）" code={generatedCodes.admin} copied={copiedCode === 'new-admin'} onCopy={copyCode} />
                            <CodeBox id="new-member" label="会員共通コード（PoC開始まで無効）" code={generatedCodes.member} copied={copiedCode === 'new-member'} onCopy={copyCode} />
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
                                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">{communityStatusLabel(community)}</span>
                                    </div>
                                    <p className="mt-2 text-sm text-slate-500">代表者: {community.representativeEmail ?? '未設定'}</p>
                                </div>
                                <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                                    <div className="rounded-xl bg-slate-50 p-3"><div className="flex items-center gap-1 text-xs font-bold text-slate-500"><Users className="h-4 w-4" />有効 / 定員</div><form onSubmit={(event) => { event.preventDefault(); const value = Number(new FormData(event.currentTarget).get('capacity')); run(() => updateCommunityCapacity(community.id, value)); }} className="mt-1 flex items-center gap-1"><span className="font-black text-slate-800">{community.activeCount} /</span><input name="capacity" type="number" min="2" max="200" defaultValue={community.maxMembers} aria-label={`${community.name}の定員`} className="w-14 rounded border border-slate-300 bg-white px-1 py-0.5 text-center font-black text-slate-800" /><button disabled={isPending} className="rounded bg-indigo-600 px-1.5 py-0.5 text-[10px] font-bold text-white">変更</button></form></div>
                                    <Stat icon={<ShieldCheck className="h-4 w-4" />} label="招待済み" value={`${community.invitedCount}名`} />
                                    <Stat icon={<CalendarClock className="h-4 w-4" />} label="利用期限" value={formatDate(community.accessExpiresAt)} />
                                </div>
                            </div>

                            <div className="mt-5 rounded-2xl bg-slate-50 p-4">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                        <p className="text-xs font-bold text-slate-500">代表者用コード（指定メール・1回限り）</p>
                                        <p className="mt-1 text-sm text-slate-600">{community.representativeEmail ?? '代表者メール未設定'} ／ 発行から14日間</p>
                                    </div>
                                    <button disabled={isPending} onClick={() => requestConfirmation({ title: '代表者用コードを再発行しますか？', description: '現在のコードはすぐに無効になり、新しいコードは発行から14日間有効です。', confirmLabel: '再発行する', action: () => rotateRepresentativeInviteCode(community.id) })} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700 disabled:opacity-50"><RotateCcw className="h-4 w-4" />再発行</button>
                                </div>
                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                    <code className="break-all font-bold text-slate-800">{community.representativeInviteCode ?? '未発行'}</code>
                                    {community.representativeInviteCode && <CopyButton id={`representative-${community.id}`} code={community.representativeInviteCode} copied={copiedCode === `representative-${community.id}`} onCopy={copyCode} label="代表者用コードをコピー" />}
                                    <span className={`rounded-full px-2 py-1 text-xs font-bold ${community.representativeInviteActive && isFuture(community.representativeInviteExpiresAt) && community.representativeInviteUseCount === 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>{community.representativeInviteActive && isFuture(community.representativeInviteExpiresAt) && community.representativeInviteUseCount === 0 ? `有効：${formatDate(community.representativeInviteExpiresAt)}まで` : '無効・利用済み・期限切れ'}</span>
                                </div>
                            </div>

                            <div className="mt-3 rounded-2xl bg-slate-50 p-4">
                                <p className="text-xs font-bold text-slate-500">会員共通コード</p>
                                <div className="mt-1 flex flex-wrap items-center gap-2">
                                    <code className="break-all font-bold text-slate-800">{community.memberInviteCode ?? '未発行'}</code>
                                    {community.memberInviteCode && <CopyButton id={`member-${community.id}`} code={community.memberInviteCode} copied={copiedCode === `member-${community.id}`} onCopy={copyCode} label="会員共通コードをコピー" />}
                                    <span className={`rounded-full px-2 py-1 text-xs font-bold ${community.memberInviteActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>{community.memberInviteActive ? `有効：${formatDate(community.memberInviteExpiresAt)}まで` : '利用開始まで無効'}</span>
                                </div>
                            </div>

                            <div className="mt-5 flex flex-wrap gap-2">
                                <button disabled={isPending || community.status !== 'trial'} onClick={() => run(() => activateCommunityPoc(community.id))} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">3か月の利用を開始</button>
                                {[1, 3, 12].map((months) => (
                                    <button key={months} disabled={isPending || !['poc', 'active'].includes(community.status)} onClick={() => run(() => extendCommunityAccess(community.id, months as 1 | 3 | 12))} className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-bold text-indigo-700 disabled:opacity-50">+{months}か月延長</button>
                                ))}
                                {community.status === 'ended' && <button disabled={isPending} onClick={() => setRestartCommunity(community)} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">契約を再開する</button>}
                                <Link href={`/community-admin?community=${community.id}`} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700">会員を管理</Link>
                                <button disabled={isPending} onClick={() => requestConfirmation(community.status === 'trial' && community.activeCount === 0 ? { title: 'コミュニティを削除しますか？', description: '未利用のテストコミュニティと招待コードを完全に削除します。この操作は取り消せません。', confirmLabel: '完全に削除する', action: () => deleteUnusedTrialCommunity(community.id) } : { title: 'コミュニティを今すぐ完全削除しますか？', description: 'このコミュニティの会員一覧・招待コードを削除します。他コミュニティに所属していない会員は、アカウント・ポートフォリオ・CSV由来データも直ちに削除されます。この操作は取り消せません。', confirmLabel: '今すぐ完全削除する', action: () => forceDeleteCommunity(community.id) })} className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-bold text-red-700 disabled:opacity-50"><Trash2 className="h-4 w-4" />コミュニティを削除する</button>
                                <button disabled={isPending || community.status === 'ended'} onClick={() => requestConfirmation({ title: '契約を終了しますか？', description: '会員は直ちに利用できなくなります。個人データは30日間保留し、その後に自動削除します。保留期間中は会員管理から復旧できます。', confirmLabel: '契約を終了する', action: () => endCommunityAccess(community.id) })} className="ml-auto inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-bold text-red-700 disabled:opacity-50"><StopCircle className="h-4 w-4" />{community.status === 'ended' ? '契約終了済み' : '契約を終了する'}</button>
                            </div>
                        </article>
                    ))}
                </section>
            </div>
            {confirmation && <ConfirmationDialog title={confirmation.title} description={confirmation.description} confirmLabel={confirmation.confirmLabel} onCancel={() => setConfirmation(null)} onConfirm={confirmAction} />}
            {restartCommunity && <RestartDialog communityName={restartCommunity.name} onCancel={() => setRestartCommunity(null)} onSelect={(months) => { const communityId = restartCommunity.id; setRestartCommunity(null); run(() => extendCommunityAccess(communityId, months)); }} />}
        </main>
    );
}

function ConfirmationDialog({ title, description, confirmLabel, onCancel, onConfirm }: { title: string; description: string; confirmLabel: string; onCancel: () => void; onConfirm: () => void }) {
    return <div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/40 p-4" role="dialog" aria-modal="true" aria-labelledby="confirmation-title">
        <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <h2 id="confirmation-title" className="text-xl font-black text-slate-900">{title}</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">{description}</p>
            <div className="mt-6 flex justify-end gap-3"><button onClick={onCancel} className="rounded-xl border border-slate-300 px-4 py-2.5 font-bold text-slate-700">キャンセル</button><button onClick={onConfirm} className="rounded-xl bg-red-600 px-4 py-2.5 font-bold text-white">{confirmLabel}</button></div>
        </div>
    </div>;
}

function RestartDialog({ communityName, onCancel, onSelect }: { communityName: string; onCancel: () => void; onSelect: (months: 1 | 3 | 12) => void }) {
    return <div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/40 p-4" role="dialog" aria-modal="true" aria-labelledby="restart-title">
        <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl"><h2 id="restart-title" className="text-xl font-black text-slate-900">契約を再開しますか？</h2><p className="mt-3 text-sm leading-6 text-slate-600">{communityName} の利用を再開する期間を選んでください。削除予約中の会員も復旧します。</p><div className="mt-5 grid grid-cols-3 gap-2">{([1, 3, 12] as const).map((months) => <button key={months} onClick={() => onSelect(months)} className="rounded-xl bg-emerald-600 px-3 py-3 font-bold text-white">{months}か月</button>)}</div><button onClick={onCancel} className="mt-4 w-full rounded-xl border border-slate-300 px-4 py-2.5 font-bold text-slate-700">キャンセル</button></div>
    </div>;
}

function CopyButton({ id, code, copied, onCopy, label }: { id: string; code: string; copied: boolean; onCopy: (id: string, code: string) => void; label: string }) {
    return <span className="inline-flex items-center gap-2"><button type="button" onClick={() => onCopy(id, code)} aria-label={label} className="rounded-lg bg-white p-2 text-indigo-600 shadow">{copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}</button>{copied && <span className="text-xs font-bold text-emerald-700">コピーしました</span>}</span>;
}

function CodeBox({ id, label, code, copied, onCopy }: { id: string; label: string; code: string; copied: boolean; onCopy: (id: string, code: string) => void }) {
    return <div><p className="font-bold">{label}</p><div className="mt-1 flex items-center gap-2"><code className="break-all">{code}</code><CopyButton id={id} code={code} copied={copied} onCopy={onCopy} label={`${label}をコピー`} /></div></div>;
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
    return <div className="rounded-xl bg-slate-50 p-3"><div className="flex items-center gap-1 text-xs font-bold text-slate-500">{icon}{label}</div><p className="mt-1 font-black text-slate-800">{value}</p></div>;
}

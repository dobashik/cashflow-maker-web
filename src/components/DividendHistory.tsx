'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Banknote, CheckCircle2, Clock3, FileText, RefreshCcw, Trash2, UploadCloud } from 'lucide-react';
import { loadCSV, parseSBIDividendPaymentCSV } from '@/utils/csvParser';
import {
    deleteDividendImportBatch,
    getDividendDashboardData,
    saveDividendPaymentsFromSBI,
    updateDividendPaymentProcessed,
} from '@/app/actions/dividendActions';
import type { DividendDashboardData, DividendImportBatch, DividendPayment, DividendSummary } from '@/app/actions/dividendActions';

type MonthlyDividend = {
    month: string;
    amount: number;
};

type DividendHistoryProps = {
    isSampleMode?: boolean;
    onMonthlyDataUpdate?: (data: MonthlyDividend[]) => void;
};

const emptySummary: DividendSummary = {
    totalAmount: 0,
    processedAmount: 0,
    unprocessedAmount: 0,
    processedCount: 0,
    unprocessedCount: 0,
    monthlyTotals: Array.from({ length: 12 }, (_, index) => ({ month: index + 1, amount: 0 })),
};

const emptyDashboardData: DividendDashboardData = {
    payments: [],
    batches: [],
    summary: emptySummary,
};

const formatYen = (amount: number) => `¥${Math.round(amount).toLocaleString()}`;

const taxLabel = (taxCategory: DividendPayment['taxCategory']) => {
    if (taxCategory === 'NISA') return 'NISA';
    if (taxCategory === 'Taxable') return '課税';
    return '不明';
};

export function DividendHistory({ isSampleMode = false, onMonthlyDataUpdate }: DividendHistoryProps) {
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const [dashboardData, setDashboardData] = useState<DividendDashboardData>(emptyDashboardData);
    const [isLoading, setIsLoading] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [showProcessed, setShowProcessed] = useState(true);

    const loadData = useCallback(async () => {
        if (isSampleMode) return;

        setIsLoading(true);
        setError('');
        const result = await getDividendDashboardData();

        if (result.success) {
            setDashboardData(result.data);
        } else {
            setDashboardData(emptyDashboardData);
            setError(result.message || '配当金履歴の取得に失敗しました');
        }

        setIsLoading(false);
    }, [isSampleMode]);

    useEffect(() => {
        void loadData();
    }, [loadData]);

    useEffect(() => {
        if (!onMonthlyDataUpdate) return;
        const monthlyData = dashboardData.summary.monthlyTotals.map(item => ({
            month: `${item.month}月`,
            amount: item.amount,
        }));
        onMonthlyDataUpdate(monthlyData);
    }, [dashboardData.summary.monthlyTotals, onMonthlyDataUpdate]);

    const visiblePayments = useMemo(
        () => dashboardData.payments.filter(payment => showProcessed || !payment.isProcessed),
        [dashboardData.payments, showProcessed]
    );

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;

        setIsImporting(true);
        setError('');
        setMessage('');

        try {
            const csvContent = await loadCSV(file);
            const payments = parseSBIDividendPaymentCSV(csvContent);
            const result = await saveDividendPaymentsFromSBI(payments, file.name);

            if (!result.success) {
                setError(result.message);
            } else {
                setMessage(result.message);
                await loadData();
            }
        } catch (importError) {
            console.error('Dividend CSV Import Error:', importError);
            setError('CSVの読み込みに失敗しました');
        } finally {
            setIsImporting(false);
        }
    };

    const handleToggleProcessed = async (payment: DividendPayment) => {
        setError('');
        setMessage('');

        const nextProcessed = !payment.isProcessed;
        setDashboardData(prev => {
            const payments = prev.payments.map(item => item.id === payment.id
                ? {
                    ...item,
                    isProcessed: nextProcessed,
                    processedAt: nextProcessed ? new Date().toISOString() : null,
                }
                : item);
            return { ...prev, payments, summary: buildClientSummary(payments) };
        });

        const result = await updateDividendPaymentProcessed(payment.id, nextProcessed);
        if (!result.success) {
            setError(result.message);
            await loadData();
        }
    };

    const handleDeleteBatch = async (batch: DividendImportBatch) => {
        const label = batch.fileName || new Date(batch.createdAt).toLocaleString('ja-JP');
        if (!confirm(`${label} のインポート履歴を削除しますか？\n関連する配当金履歴も削除されます。`)) return;

        setError('');
        setMessage('');
        const result = await deleteDividendImportBatch(batch.id);
        if (!result.success) {
            setError(result.message);
            return;
        }
        setMessage(result.message);
        await loadData();
    };

    if (isSampleMode) return null;

    return (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-indigo-50 w-full">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                    <h3 className="text-xl font-bold text-indigo-900 mb-2 flex items-center gap-2">
                        配当金履歴
                        <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700">
                            未処理 {dashboardData.summary.unprocessedCount}件
                        </span>
                    </h3>
                    <p className="text-xs font-mono text-slate-400 uppercase tracking-wider">ACTUAL DIVIDEND PAYMENTS</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        onClick={() => void loadData()}
                        disabled={isLoading || isImporting}
                        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        <RefreshCcw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                        更新
                    </button>
                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isImporting}
                        className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-bold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        <UploadCloud className="h-4 w-4" />
                        SBI入出金CSVを取り込む
                    </button>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".csv,text/csv"
                        className="hidden"
                        onChange={handleFileChange}
                    />
                </div>
            </div>

            <p className="mt-4 text-xs text-slate-500">
                SBI証券の入出金明細から「入金」かつ「利金・配当金」だけを保存します。CSV本文は保存せず、期間が重なって同じ配当が含まれる場合は重複としてスキップします。
            </p>

            {(message || error) && (
                <div className={`mt-4 rounded-xl p-3 text-sm ${error ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>
                    {error || message}
                </div>
            )}

            <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
                <SummaryCard label="実績配当合計" value={formatYen(dashboardData.summary.totalAmount)} />
                <SummaryCard label="処理済み" value={formatYen(dashboardData.summary.processedAmount)} sub={`${dashboardData.summary.processedCount}件`} tone="emerald" />
                <SummaryCard label="未処理" value={formatYen(dashboardData.summary.unprocessedAmount)} sub={`${dashboardData.summary.unprocessedCount}件`} tone="amber" />
            </div>

            <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
                <div className="min-w-0">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                        <h4 className="font-bold text-slate-800">配当金一覧</h4>
                        <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-bold text-slate-500">
                            <input
                                type="checkbox"
                                checked={showProcessed}
                                onChange={(event) => setShowProcessed(event.target.checked)}
                                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600"
                            />
                            処理済みも表示
                        </label>
                    </div>

                    <div className="overflow-auto rounded-xl border border-slate-100">
                        <table className="w-full min-w-[760px] text-sm">
                            <thead className="bg-slate-50 text-xs text-slate-500">
                                <tr>
                                    <th className="px-4 py-3 text-left">状態</th>
                                    <th className="px-4 py-3 text-left">入金日</th>
                                    <th className="px-4 py-3 text-left">銘柄名</th>
                                    <th className="px-4 py-3 text-left">区分</th>
                                    <th className="px-4 py-3 text-right">入金額</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {visiblePayments.map(payment => (
                                    <tr key={payment.id} className={payment.isProcessed ? 'bg-slate-50/60 text-slate-500' : 'bg-white'}>
                                        <td className="px-4 py-3">
                                            <button
                                                type="button"
                                                onClick={() => void handleToggleProcessed(payment)}
                                                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold transition-colors ${payment.isProcessed
                                                    ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                                                    : 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                                                    }`}
                                            >
                                                {payment.isProcessed ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Clock3 className="h-3.5 w-3.5" />}
                                                {payment.isProcessed ? '処理済み' : '未処理'}
                                            </button>
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap">{new Date(`${payment.paymentDate}T00:00:00`).toLocaleDateString('ja-JP')}</td>
                                        <td className="px-4 py-3 font-bold text-slate-700">{payment.stockName}</td>
                                        <td className="px-4 py-3">
                                            <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${payment.taxCategory === 'NISA'
                                                ? 'bg-emerald-50 text-emerald-700'
                                                : 'bg-slate-100 text-slate-600'
                                                }`}>
                                                {taxLabel(payment.taxCategory)}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-right font-bold text-indigo-700">{formatYen(payment.amount)}</td>
                                    </tr>
                                ))}
                                {visiblePayments.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="px-4 py-12 text-center text-slate-400">
                                            配当金履歴はまだありません。
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-4">
                    <h4 className="mb-3 flex items-center gap-2 font-bold text-slate-800">
                        <FileText className="h-4 w-4 text-indigo-600" />
                        インポート履歴
                    </h4>
                    <div className="space-y-2">
                        {dashboardData.batches.map(batch => (
                            <div key={batch.id} className="rounded-lg border border-slate-200 bg-white p-3">
                                <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <p className="truncate text-xs font-bold text-slate-700" title={batch.fileName || undefined}>
                                            {batch.fileName || 'ファイル名なし'}
                                        </p>
                                        <p className="mt-1 text-[11px] text-slate-400">
                                            {new Date(batch.createdAt).toLocaleString('ja-JP')}
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => void handleDeleteBatch(batch)}
                                        className="rounded-lg p-1.5 text-slate-300 hover:bg-rose-50 hover:text-rose-600"
                                        title="このインポート履歴を削除"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </button>
                                </div>
                                <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                                    <span className="rounded-full bg-emerald-50 px-2 py-1 font-bold text-emerald-700">保存 {batch.importedCount}件</span>
                                    <span className="rounded-full bg-slate-100 px-2 py-1 font-bold text-slate-500">重複 {batch.skippedDuplicateCount}件</span>
                                </div>
                            </div>
                        ))}
                        {dashboardData.batches.length === 0 && (
                            <div className="rounded-lg border border-dashed border-slate-200 bg-white p-6 text-center text-xs text-slate-400">
                                インポート履歴はまだありません。
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {isImporting && (
                <div className="mt-4 flex items-center gap-2 rounded-xl bg-indigo-50 p-3 text-sm font-bold text-indigo-700">
                    <RefreshCcw className="h-4 w-4 animate-spin" />
                    CSVを解析・保存中...
                </div>
            )}
        </div>
    );
}

function SummaryCard({ label, value, sub, tone = 'indigo' }: { label: string; value: string; sub?: string; tone?: 'indigo' | 'emerald' | 'amber' }) {
    const color = tone === 'emerald'
        ? 'bg-emerald-50 text-emerald-700'
        : tone === 'amber'
            ? 'bg-amber-50 text-amber-700'
            : 'bg-indigo-50 text-indigo-700';

    return (
        <div className={`rounded-xl p-4 ${color}`}>
            <div className="flex items-center gap-2 text-xs font-bold opacity-80">
                <Banknote className="h-4 w-4" />
                {label}
            </div>
            <div className="mt-2 text-2xl font-black">{value}</div>
            {sub && <div className="mt-1 text-xs font-bold opacity-70">{sub}</div>}
        </div>
    );
}

function buildClientSummary(payments: DividendPayment[]): DividendSummary {
    const currentYear = new Date().getFullYear();
    const monthlyTotals = Array.from({ length: 12 }, (_, index) => ({ month: index + 1, amount: 0 }));
    let totalAmount = 0;
    let processedAmount = 0;
    let unprocessedAmount = 0;
    let processedCount = 0;
    let unprocessedCount = 0;

    payments.forEach(payment => {
        totalAmount += payment.amount;
        if (payment.isProcessed) {
            processedAmount += payment.amount;
            processedCount += 1;
        } else {
            unprocessedAmount += payment.amount;
            unprocessedCount += 1;
        }

        const date = new Date(`${payment.paymentDate}T00:00:00`);
        if (date.getFullYear() === currentYear) {
            monthlyTotals[date.getMonth()].amount += payment.amount;
        }
    });

    return {
        totalAmount,
        processedAmount,
        unprocessedAmount,
        processedCount,
        unprocessedCount,
        monthlyTotals,
    };
}

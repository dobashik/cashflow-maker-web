'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Banknote, CheckCircle2, Clock3, FileText, RefreshCcw, Trash2, UploadCloud } from 'lucide-react';
import { loadCSV, parseSBIDividendPaymentCSV } from '@/utils/csvParser';
import {
    deleteDividendImportBatch,
    getDividendDashboardData,
    markDividendPaymentsProcessedUntil,
    saveDividendPaymentsFromSBI,
    updateDividendPaymentProcessed,
} from '@/app/actions/dividendActions';
import type { DividendDashboardData, DividendImportBatch, DividendPayment, DividendSummary } from '@/app/actions/dividendActions';

type MonthlyDividend = {
    month: string;
    amount: number;
    status?: 'actual' | 'projected';
    sourceLabel?: string;
};

type DividendHistoryProps = {
    isSampleMode?: boolean;
    onMonthlyDataUpdate?: (data: MonthlyDividend[]) => void;
    onAnnualDataUpdate?: (annualAmount: number, year: number) => void;
};

const emptySummary: DividendSummary = {
    totalAmount: 0,
    processedAmount: 0,
    unprocessedAmount: 0,
    processedCount: 0,
    unprocessedCount: 0,
    monthlyTotals: Array.from({ length: 12 }, (_, index) => ({ month: index + 1, amount: 0 })),
    year: new Date().getFullYear(),
    availableYears: [new Date().getFullYear()],
};

const emptyDashboardData: DividendDashboardData = {
    payments: [],
    batches: [],
    summary: emptySummary,
};

const formatYen = (amount: number) => `¥${Math.round(amount).toLocaleString()}`;
const INITIAL_PAYMENT_ROWS = 15;

const taxLabel = (taxCategory: DividendPayment['taxCategory']) => {
    if (taxCategory === 'NISA') return 'NISA';
    if (taxCategory === 'Taxable') return '課税';
    return '不明';
};

export function DividendHistory({ isSampleMode = false, onMonthlyDataUpdate, onAnnualDataUpdate }: DividendHistoryProps) {
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const [dashboardData, setDashboardData] = useState<DividendDashboardData>(emptyDashboardData);
    const [isLoading, setIsLoading] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [showProcessed, setShowProcessed] = useState(true);
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [bulkProcessedUntil, setBulkProcessedUntil] = useState(() => new Date().toISOString().slice(0, 10));
    const [isBulkProcessing, setIsBulkProcessing] = useState(false);
    const [showAllPayments, setShowAllPayments] = useState(false);

    const loadData = useCallback(async (year = selectedYear) => {
        if (isSampleMode) return;

        setIsLoading(true);
        setError('');
        const result = await getDividendDashboardData(year);

        if (result.success) {
            setDashboardData(result.data);
        } else {
            setDashboardData(emptyDashboardData);
            setError(result.message || '配当金履歴の取得に失敗しました');
        }

        setIsLoading(false);
    }, [isSampleMode, selectedYear]);

    useEffect(() => {
        void loadData();
    }, [loadData]);

    useEffect(() => {
        if (!onMonthlyDataUpdate) return;
        onMonthlyDataUpdate(buildRollingDividendCalendarData(dashboardData.payments));
    }, [dashboardData.payments, onMonthlyDataUpdate]);

    useEffect(() => {
        if (!onAnnualDataUpdate) return;
        const rollingAnnualAmount = buildRollingDividendCalendarData(dashboardData.payments)
            .reduce((sum, item) => sum + item.amount, 0);
        onAnnualDataUpdate(rollingAnnualAmount, new Date().getFullYear());
    }, [dashboardData.payments, onAnnualDataUpdate]);

    const visiblePayments = useMemo(
        () => dashboardData.payments.filter(payment => showProcessed || !payment.isProcessed),
        [dashboardData.payments, showProcessed]
    );

    const displayedPayments = useMemo(
        () => showAllPayments ? visiblePayments : visiblePayments.slice(0, INITIAL_PAYMENT_ROWS),
        [showAllPayments, visiblePayments]
    );

    const hiddenPaymentCount = Math.max(visiblePayments.length - displayedPayments.length, 0);

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
                await loadData(selectedYear);
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
            return { ...prev, payments, summary: buildClientSummary(payments, selectedYear) };
        });

        const result = await updateDividendPaymentProcessed(payment.id, nextProcessed);
        if (!result.success) {
            setError(result.message);
            await loadData(selectedYear);
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
        await loadData(selectedYear);
    };

    const handleBulkProcessUntil = async () => {
        if (!bulkProcessedUntil) {
            setError('処理済みにする基準日を指定してください');
            return;
        }

        if (!confirm(`${bulkProcessedUntil}以前の未処理配当をすべて処理済みにしますか？`)) return;

        setIsBulkProcessing(true);
        setError('');
        setMessage('');

        const result = await markDividendPaymentsProcessedUntil(bulkProcessedUntil);
        setIsBulkProcessing(false);

        if (!result.success) {
            setError(result.message);
            return;
        }

        setMessage(result.message);
        await loadData(selectedYear);
    };

    const handleYearChange = (year: number) => {
        setSelectedYear(year);
        void loadData(year);
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
                    <select
                        value={selectedYear}
                        onChange={(event) => handleYearChange(Number(event.target.value))}
                        className="rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2 text-sm font-bold text-indigo-700 outline-none focus:ring-2 focus:ring-indigo-200"
                    >
                        {dashboardData.summary.availableYears.map(year => (
                            <option key={year} value={year}>{year}年</option>
                        ))}
                    </select>
                    <button
                        type="button"
                        onClick={() => void loadData(selectedYear)}
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

            <div className="mt-5 rounded-2xl border border-emerald-100 bg-gradient-to-r from-emerald-50 via-cyan-50 to-indigo-50 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                        <div className="flex items-center gap-2 font-bold text-slate-800">
                            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                            指定日以前をまとめて処理済みにする
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                            入力した日付以前の未処理データだけを処理済みにします。すでに処理済みのデータはそのままです。
                        </p>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <input
                            type="date"
                            value={bulkProcessedUntil}
                            onChange={(event) => setBulkProcessedUntil(event.target.value)}
                            className="rounded-xl border border-emerald-100 bg-white px-3 py-2 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-emerald-200"
                        />
                        <button
                            type="button"
                            onClick={() => void handleBulkProcessUntil()}
                            disabled={isBulkProcessing || isLoading}
                            className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            <CheckCircle2 className="h-4 w-4" />
                            {isBulkProcessing ? '更新中...' : '一括で処理済み'}
                        </button>
                    </div>
                </div>
            </div>

            {(message || error) && (
                <div className={`mt-4 rounded-xl p-3 text-sm ${error ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>
                    {error || message}
                </div>
            )}

            <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
                <SummaryCard label={`${dashboardData.summary.year}年の実績配当`} value={formatYen(dashboardData.summary.monthlyTotals.reduce((sum, item) => sum + item.amount, 0))} />
                <SummaryCard label="処理済み" value={formatYen(dashboardData.summary.processedAmount)} sub={`${dashboardData.summary.processedCount}件`} tone="emerald" />
                <SummaryCard label="未処理" value={formatYen(dashboardData.summary.unprocessedAmount)} sub={`${dashboardData.summary.unprocessedCount}件`} tone="amber" />
            </div>

            <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
                <div className="min-w-0">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <h4 className="font-bold text-slate-800">配当金一覧</h4>
                            <p className="mt-1 text-xs text-slate-400">
                                {visiblePayments.length}件中 {displayedPayments.length}件を表示
                            </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                            {visiblePayments.length > INITIAL_PAYMENT_ROWS && (
                                <button
                                    type="button"
                                    onClick={() => setShowAllPayments(prev => !prev)}
                                    className="rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-600 hover:bg-indigo-100"
                                >
                                    {showAllPayments ? '15件表示に戻す' : `残り${hiddenPaymentCount}件を表示`}
                                </button>
                            )}
                            <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-bold text-slate-500">
                                <input
                                    type="checkbox"
                                    checked={showProcessed}
                                    onChange={(event) => {
                                        setShowProcessed(event.target.checked);
                                        setShowAllPayments(false);
                                    }}
                                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600"
                                />
                                処理済みも表示
                            </label>
                        </div>
                    </div>

                    <div className={`overflow-auto rounded-xl border border-slate-100 ${showAllPayments ? 'max-h-[620px]' : ''}`}>
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
                                {displayedPayments.map(payment => (
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
                    {visiblePayments.length > INITIAL_PAYMENT_ROWS && !showAllPayments && (
                        <div className="mt-3 rounded-xl bg-slate-50 p-3 text-center text-xs font-bold text-slate-500">
                            長期履歴に備えて直近{INITIAL_PAYMENT_ROWS}件だけ表示しています。必要なときだけ全件を開けます。
                        </div>
                    )}
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

function buildClientSummary(payments: DividendPayment[], selectedYear: number): DividendSummary {
    const monthlyTotals = Array.from({ length: 12 }, (_, index) => ({ month: index + 1, amount: 0 }));
    const availableYears = Array.from(new Set(payments.map(payment => new Date(`${payment.paymentDate}T00:00:00`).getFullYear())))
        .filter(year => Number.isFinite(year))
        .sort((a, b) => b - a);
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
        if (date.getFullYear() === selectedYear) {
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
        year: selectedYear,
        availableYears: availableYears.length > 0 ? availableYears : [selectedYear],
    };
}

function buildRollingDividendCalendarData(payments: DividendPayment[]): MonthlyDividend[] {
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonthIndex = today.getMonth();
    const monthlyAmountMap = new Map<string, number>();

    payments.forEach(payment => {
        const date = new Date(`${payment.paymentDate}T00:00:00`);
        if (Number.isNaN(date.getTime())) return;

        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        monthlyAmountMap.set(key, (monthlyAmountMap.get(key) || 0) + payment.amount);
    });

    return Array.from({ length: 12 }, (_, offset) => {
        const displayDate = new Date(currentYear, currentMonthIndex + offset, 1);
        const displayYear = displayDate.getFullYear();
        const displayMonth = displayDate.getMonth() + 1;
        const isCurrentMonth = offset === 0;
        const sourceYear = isCurrentMonth ? displayYear : displayYear - 1;
        const sourceKey = `${sourceYear}-${String(displayMonth).padStart(2, '0')}`;
        const amount = monthlyAmountMap.get(sourceKey) || 0;

        return {
            month: `${displayMonth}月`,
            amount,
            status: isCurrentMonth ? 'actual' : 'projected',
            sourceLabel: isCurrentMonth ? `${displayYear}年実績` : `${sourceYear}年同月`,
        };
    });
}

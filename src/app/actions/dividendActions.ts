'use server';

import { createClient } from '@/utils/supabase/server';
import type { ImportedDividendPayment } from '@/utils/csvParser';

export type DividendPayment = {
    id: string;
    batchId: string | null;
    broker: 'SBI';
    paymentDate: string;
    stockName: string;
    amount: number;
    taxCategory: 'NISA' | 'Taxable' | 'Unknown';
    isProcessed: boolean;
    processedAt: string | null;
    processedNote: string | null;
    createdAt: string;
};

export type DividendImportBatch = {
    id: string;
    broker: 'SBI';
    fileName: string | null;
    importedCount: number;
    skippedDuplicateCount: number;
    paymentStartDate: string | null;
    paymentEndDate: string | null;
    createdAt: string;
};

export type DividendSummary = {
    totalAmount: number;
    processedAmount: number;
    unprocessedAmount: number;
    processedCount: number;
    unprocessedCount: number;
    monthlyTotals: { month: number; amount: number }[];
    year: number;
    availableYears: number[];
};

export type DividendDashboardData = {
    payments: DividendPayment[];
    batches: DividendImportBatch[];
    summary: DividendSummary;
};

const normalizeIncomingPayment = (payment: ImportedDividendPayment): ImportedDividendPayment | null => {
    const amount = Number(payment.amount);
    const paymentDate = String(payment.paymentDate || '').trim();
    const stockName = String(payment.stockName || '').trim();
    const sourceFingerprint = String(payment.sourceFingerprint || '').trim();

    if (payment.broker !== 'SBI') return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) return null;
    if (!stockName || amount <= 0 || !sourceFingerprint) return null;

    const taxCategory = ['NISA', 'Taxable', 'Unknown'].includes(payment.taxCategory)
        ? payment.taxCategory
        : 'Unknown';

    return {
        broker: 'SBI',
        paymentDate,
        stockName,
        amount: Math.round(amount),
        taxCategory,
        sourceFingerprint,
    };
};

const buildSummary = (payments: DividendPayment[], selectedYear = new Date().getFullYear()): DividendSummary => {
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
        if (date.getFullYear() !== selectedYear) return;
        monthlyTotals[date.getMonth()].amount += payment.amount;
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
};

export async function getDividendDashboardData(selectedYear = new Date().getFullYear()): Promise<{
    success: boolean;
    data: DividendDashboardData;
    message?: string;
}> {
    const emptyData: DividendDashboardData = {
        payments: [],
        batches: [],
        summary: buildSummary([], selectedYear),
    };

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return { success: false, data: emptyData, message: 'ログインが必要です' };
    }

    const [paymentsResult, batchesResult] = await Promise.all([
        supabase
            .from('dividend_payments')
            .select('id, batch_id, broker, payment_date, stock_name, amount, tax_category, is_processed, processed_at, processed_note, created_at')
            .eq('user_id', user.id)
            .order('payment_date', { ascending: false })
            .order('created_at', { ascending: false }),
        supabase
            .from('dividend_import_batches')
            .select('id, broker, file_name, imported_count, skipped_duplicate_count, payment_start_date, payment_end_date, created_at')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false }),
    ]);

    if (paymentsResult.error || batchesResult.error) {
        console.error('Dividend Dashboard Fetch Error:', paymentsResult.error || batchesResult.error);
        return { success: false, data: emptyData, message: '配当金履歴の取得に失敗しました。Supabaseで配当金履歴テーブルのSQLを実行してください。' };
    }

    const payments: DividendPayment[] = (paymentsResult.data || []).map(row => ({
        id: row.id,
        batchId: row.batch_id,
        broker: row.broker as 'SBI',
        paymentDate: row.payment_date,
        stockName: row.stock_name,
        amount: Number(row.amount),
        taxCategory: row.tax_category as 'NISA' | 'Taxable' | 'Unknown',
        isProcessed: Boolean(row.is_processed),
        processedAt: row.processed_at,
        processedNote: row.processed_note,
        createdAt: row.created_at,
    }));

    const batches: DividendImportBatch[] = (batchesResult.data || []).map(row => ({
        id: row.id,
        broker: row.broker as 'SBI',
        fileName: row.file_name,
        importedCount: Number(row.imported_count),
        skippedDuplicateCount: Number(row.skipped_duplicate_count),
        paymentStartDate: row.payment_start_date,
        paymentEndDate: row.payment_end_date,
        createdAt: row.created_at,
    }));

    return {
        success: true,
        data: {
            payments,
            batches,
            summary: buildSummary(payments, selectedYear),
        },
    };
}

export async function saveDividendPaymentsFromSBI(
    incomingPayments: ImportedDividendPayment[],
    fileName?: string
): Promise<{
    success: boolean;
    message: string;
    importedCount: number;
    skippedDuplicateCount: number;
}> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return { success: false, message: 'ログインが必要です', importedCount: 0, skippedDuplicateCount: 0 };
    }

    const uniqueMap = new Map<string, ImportedDividendPayment>();
    let skippedDuplicateCount = 0;

    incomingPayments.forEach(payment => {
        const normalized = normalizeIncomingPayment(payment);
        if (!normalized) return;

        if (uniqueMap.has(normalized.sourceFingerprint)) {
            skippedDuplicateCount += 1;
            return;
        }
        uniqueMap.set(normalized.sourceFingerprint, normalized);
    });

    const uniquePayments = Array.from(uniqueMap.values());
    if (uniquePayments.length === 0) {
        return { success: false, message: '取り込み対象の配当金データがありません', importedCount: 0, skippedDuplicateCount };
    }

    const fingerprints = uniquePayments.map(payment => payment.sourceFingerprint);
    const { data: existingRows, error: existingError } = await supabase
        .from('dividend_payments')
        .select('source_fingerprint')
        .eq('user_id', user.id)
        .in('source_fingerprint', fingerprints);

    if (existingError) {
        console.error('Dividend Existing Check Error:', existingError);
        return { success: false, message: '重複確認に失敗しました。Supabaseで配当金履歴テーブルのSQLを実行してください。', importedCount: 0, skippedDuplicateCount };
    }

    const existingFingerprints = new Set((existingRows || []).map(row => row.source_fingerprint));
    const newPayments = uniquePayments.filter(payment => !existingFingerprints.has(payment.sourceFingerprint));
    skippedDuplicateCount += uniquePayments.length - newPayments.length;

    const dates = uniquePayments.map(payment => payment.paymentDate).sort();
    const { data: batch, error: batchError } = await supabase
        .from('dividend_import_batches')
        .insert({
            user_id: user.id,
            broker: 'SBI',
            file_name: fileName || null,
            imported_count: newPayments.length,
            skipped_duplicate_count: skippedDuplicateCount,
            payment_start_date: dates[0] || null,
            payment_end_date: dates[dates.length - 1] || null,
        })
        .select('id')
        .single();

    if (batchError) {
        console.error('Dividend Batch Insert Error:', batchError);
        return { success: false, message: 'インポート履歴の保存に失敗しました', importedCount: 0, skippedDuplicateCount };
    }

    if (newPayments.length > 0) {
        const rows = newPayments.map(payment => ({
            user_id: user.id,
            batch_id: batch.id,
            broker: payment.broker,
            payment_date: payment.paymentDate,
            stock_name: payment.stockName,
            amount: payment.amount,
            tax_category: payment.taxCategory,
            source_fingerprint: payment.sourceFingerprint,
        }));

        const { error: insertError } = await supabase
            .from('dividend_payments')
            .insert(rows);

        if (insertError) {
            console.error('Dividend Payments Insert Error:', insertError);
            return { success: false, message: '配当金履歴の保存に失敗しました', importedCount: 0, skippedDuplicateCount };
        }
    }

    return {
        success: true,
        importedCount: newPayments.length,
        skippedDuplicateCount,
        message: `${newPayments.length}件の配当金を保存しました。重複 ${skippedDuplicateCount}件はスキップしました。`,
    };
}

export async function updateDividendPaymentProcessed(
    paymentId: string,
    isProcessed: boolean
): Promise<{ success: boolean; message: string }> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return { success: false, message: 'ログインが必要です' };
    }

    const { error } = await supabase
        .from('dividend_payments')
        .update({
            is_processed: isProcessed,
            processed_at: isProcessed ? new Date().toISOString() : null,
            updated_at: new Date().toISOString(),
        })
        .eq('id', paymentId)
        .eq('user_id', user.id);

    if (error) {
        console.error('Dividend Payment Processed Update Error:', error);
        return { success: false, message: '処理済み状態の更新に失敗しました' };
    }

    return { success: true, message: isProcessed ? '処理済みにしました' : '未処理に戻しました' };
}

export async function deleteDividendImportBatch(batchId: string): Promise<{ success: boolean; message: string }> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return { success: false, message: 'ログインが必要です' };
    }

    const { error } = await supabase
        .from('dividend_import_batches')
        .delete()
        .eq('id', batchId)
        .eq('user_id', user.id);

    if (error) {
        console.error('Dividend Batch Delete Error:', error);
        return { success: false, message: 'インポート履歴の削除に失敗しました' };
    }

    return { success: true, message: 'インポート履歴と関連する配当金履歴を削除しました' };
}

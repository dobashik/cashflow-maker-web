'use server';

import { createClient } from '@/utils/supabase/server';
import { DEFAULT_EXPENSE_ITEMS } from '@/lib/expenseData';
import type { ExpenseItem } from '@/lib/expenseData';

const sanitizeExpenseItem = (item: ExpenseItem, index: number): ExpenseItem => ({
    id: item.id,
    label: String(item.label || 'その他').trim().slice(0, 30) || 'その他',
    emoji: String(item.emoji || '💡').trim().slice(0, 8) || '💡',
    amount: Math.max(0, Math.round(Number(item.amount) || 0)),
    color: String(item.color || 'bg-indigo-400').trim(),
    sortOrder: Number.isFinite(item.sortOrder) ? item.sortOrder : index,
});

export async function getExpenseItems(): Promise<{
    success: boolean;
    items: ExpenseItem[];
    message?: string;
}> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return { success: false, items: DEFAULT_EXPENSE_ITEMS, message: 'ログインが必要です' };
    }

    const { data, error } = await supabase
        .from('expense_items')
        .select('id, label, emoji, amount, color, sort_order')
        .eq('user_id', user.id)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });

    if (error) {
        console.error('Expense Items Fetch Error:', error);
        return {
            success: false,
            items: DEFAULT_EXPENSE_ITEMS,
            message: '支出項目の取得に失敗しました。Supabaseで生活費設定テーブルのSQLを実行してください。',
        };
    }

    if (!data || data.length === 0) {
        return { success: true, items: DEFAULT_EXPENSE_ITEMS };
    }

    return {
        success: true,
        items: data.map(row => ({
            id: row.id,
            label: row.label,
            emoji: row.emoji,
            amount: Number(row.amount),
            color: row.color,
            sortOrder: Number(row.sort_order),
        })),
    };
}

export async function saveExpenseItems(items: ExpenseItem[]): Promise<{
    success: boolean;
    message: string;
    items: ExpenseItem[];
}> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return { success: false, message: 'ログインが必要です', items: [] };
    }

    const sanitizedItems = items
        .map(sanitizeExpenseItem)
        .filter(item => item.label && item.amount >= 0)
        .slice(0, 30)
        .map((item, index) => ({ ...item, sortOrder: index }));

    if (sanitizedItems.length === 0) {
        return { success: false, message: '支出項目を1件以上入力してください', items: [] };
    }

    const { error: deleteError } = await supabase
        .from('expense_items')
        .delete()
        .eq('user_id', user.id);

    if (deleteError) {
        console.error('Expense Items Delete Error:', deleteError);
        return { success: false, message: '既存の支出項目の更新に失敗しました', items: [] };
    }

    const rows = sanitizedItems.map(item => ({
        user_id: user.id,
        label: item.label,
        emoji: item.emoji,
        amount: item.amount,
        color: item.color,
        sort_order: item.sortOrder,
        updated_at: new Date().toISOString(),
    }));

    const { data, error: insertError } = await supabase
        .from('expense_items')
        .insert(rows)
        .select('id, label, emoji, amount, color, sort_order');

    if (insertError) {
        console.error('Expense Items Insert Error:', insertError);
        return { success: false, message: '支出項目の保存に失敗しました', items: [] };
    }

    return {
        success: true,
        message: '生活費設定を保存しました',
        items: (data || []).map(row => ({
            id: row.id,
            label: row.label,
            emoji: row.emoji,
            amount: Number(row.amount),
            color: row.color,
            sortOrder: Number(row.sort_order),
        })),
    };
}

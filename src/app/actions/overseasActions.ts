'use server';

import { createClient } from '@/utils/supabase/server';
import { KNOWN_DIVIDEND_MONTHS, OVERSEAS_ACCOUNT_TYPES } from '@/lib/overseas';
import type { OverseasAccountType, OverseasHolding } from '@/lib/overseas';

type OverseasHoldingRow = {
    id: string;
    ticker: string;
    name: string;
    exchange: string | null;
    currency: string | null;
    account_type: string;
    quantity: number | string;
    price_foreign: number | string;
    price_jpy: number | string;
    acquisition_price_foreign: number | string;
    acquisition_price_jpy: number | string;
    valuation_foreign: number | string;
    valuation_jpy: number | string;
    gain_loss_foreign: number | string;
    gain_loss_jpy: number | string;
    fx_rate: number | string;
    annual_dividend_per_share_foreign: number | string;
    dividend_months: number[] | null;
    data_date: string;
};

const toAccountType = (value: string): OverseasAccountType => (
    OVERSEAS_ACCOUNT_TYPES.includes(value as OverseasAccountType) ? value as OverseasAccountType : '特定'
);

const mapRow = (row: OverseasHoldingRow): OverseasHolding => ({
    id: row.id,
    ticker: row.ticker,
    name: row.name,
    exchange: row.exchange || '',
    currency: row.currency || 'USD',
    accountType: toAccountType(row.account_type),
    quantity: Number(row.quantity),
    priceForeign: Number(row.price_foreign),
    priceJpy: Number(row.price_jpy),
    acquisitionPriceForeign: Number(row.acquisition_price_foreign),
    acquisitionPriceJpy: Number(row.acquisition_price_jpy),
    valuationForeign: Number(row.valuation_foreign),
    valuationJpy: Number(row.valuation_jpy),
    gainLossForeign: Number(row.gain_loss_foreign),
    gainLossJpy: Number(row.gain_loss_jpy),
    fxRate: Number(row.fx_rate),
    annualDividendPerShareForeign: Number(row.annual_dividend_per_share_foreign),
    dividendMonths: row.dividend_months || [],
    dataDate: row.data_date,
});

const SELECT_COLUMNS = `
    id, ticker, name, exchange, currency, account_type, quantity,
    price_foreign, price_jpy, acquisition_price_foreign, acquisition_price_jpy,
    valuation_foreign, valuation_jpy, gain_loss_foreign, gain_loss_jpy,
    fx_rate, annual_dividend_per_share_foreign, dividend_months, data_date
`;

export async function getOverseasHoldings(): Promise<{
    success: boolean;
    holdings: OverseasHolding[];
    message?: string;
}> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return { success: false, holdings: [], message: 'ログインが必要です' };

    const { data, error } = await supabase
        .from('overseas_holdings')
        .select(SELECT_COLUMNS)
        .eq('user_id', user.id)
        .order('ticker', { ascending: true });

    if (error) {
        console.error('Overseas Holdings Fetch Error:', error);
        return {
            success: false,
            holdings: [],
            message: '海外銘柄の取得に失敗しました。Supabaseで overseas_holdings のSQLを実行してください。',
        };
    }

    return { success: true, holdings: (data as OverseasHoldingRow[]).map(mapRow) };
}

/**
 * 貼り付けから読み取った海外銘柄を保存する。
 *
 * - replace: 保存済みの海外銘柄をすべて入れ替える（画面をまるごと貼り直したとき）
 * - merge: 同じティッカー・口座の行だけ更新し、他はそのまま残す
 *
 * 1口あたりの年間分配金はユーザーが入力する値なので、取り込みでは上書きしない。
 */
export async function saveOverseasHoldings(
    holdings: OverseasHolding[],
    mode: 'replace' | 'merge' = 'replace'
): Promise<{ success: boolean; message: string; savedCount: number }> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return { success: false, message: 'ログインが必要です', savedCount: 0 };

    const cleaned = holdings
        .map(holding => ({
            ...holding,
            ticker: String(holding.ticker || '').trim().toUpperCase(),
            name: String(holding.name || '').trim(),
            accountType: toAccountType(holding.accountType),
        }))
        .filter(holding => holding.ticker && holding.quantity > 0);

    if (cleaned.length === 0) {
        return { success: false, message: '取り込める銘柄がありませんでした', savedCount: 0 };
    }

    const { data: existingRows, error: existingError } = await supabase
        .from('overseas_holdings')
        .select('id, ticker, account_type, annual_dividend_per_share_foreign, dividend_months')
        .eq('user_id', user.id);

    if (existingError) {
        console.error('Overseas Holdings Existing Fetch Error:', existingError);
        return { success: false, message: '既存データの確認に失敗しました', savedCount: 0 };
    }

    const existingMap = new Map(
        (existingRows || []).map(row => [`${row.ticker}__${row.account_type}`, row])
    );

    const now = new Date().toISOString();
    const rows = cleaned.map(holding => {
        const key = `${holding.ticker}__${holding.accountType}`;
        const existing = existingMap.get(key);
        const dividendMonths = holding.dividendMonths.length > 0
            ? holding.dividendMonths
            : (existing?.dividend_months as number[] | null)
                || KNOWN_DIVIDEND_MONTHS[holding.ticker]
                || [];
        const perShare = holding.annualDividendPerShareForeign > 0
            ? holding.annualDividendPerShareForeign
            : Number(existing?.annual_dividend_per_share_foreign || 0);

        return {
            ...(existing?.id ? { id: existing.id } : {}),
            user_id: user.id,
            broker: 'SBI',
            market: 'US',
            ticker: holding.ticker,
            name: holding.name || holding.ticker,
            exchange: holding.exchange || '',
            currency: holding.currency || 'USD',
            account_type: holding.accountType,
            quantity: holding.quantity,
            price_foreign: holding.priceForeign,
            price_jpy: holding.priceJpy,
            acquisition_price_foreign: holding.acquisitionPriceForeign,
            acquisition_price_jpy: holding.acquisitionPriceJpy,
            valuation_foreign: holding.valuationForeign,
            valuation_jpy: holding.valuationJpy,
            gain_loss_foreign: holding.gainLossForeign,
            gain_loss_jpy: holding.gainLossJpy,
            fx_rate: holding.fxRate,
            annual_dividend_per_share_foreign: perShare,
            dividend_months: dividendMonths,
            data_date: holding.dataDate || now,
            updated_at: now,
        };
    });

    if (mode === 'replace') {
        const keepKeys = new Set(rows.map(row => `${row.ticker}__${row.account_type}`));
        const idsToDelete = (existingRows || [])
            .filter(row => !keepKeys.has(`${row.ticker}__${row.account_type}`))
            .map(row => row.id);

        if (idsToDelete.length > 0) {
            const { error: deleteError } = await supabase
                .from('overseas_holdings')
                .delete()
                .eq('user_id', user.id)
                .in('id', idsToDelete);

            if (deleteError) {
                console.error('Overseas Holdings Delete Error:', deleteError);
                return { success: false, message: '古い海外銘柄の整理に失敗しました', savedCount: 0 };
            }
        }
    }

    const { error: upsertError } = await supabase
        .from('overseas_holdings')
        .upsert(rows, { onConflict: 'user_id,ticker,account_type' });

    if (upsertError) {
        console.error('Overseas Holdings Upsert Error:', upsertError);
        return {
            success: false,
            message: `海外銘柄の保存に失敗しました: ${upsertError.message || JSON.stringify(upsertError)}`,
            savedCount: 0,
        };
    }

    return {
        success: true,
        savedCount: rows.length,
        message: `${rows.length}銘柄を保存しました`,
    };
}

export async function updateOverseasHoldingDividend(
    holdingId: string,
    annualDividendPerShareForeign: number,
    dividendMonths: number[]
): Promise<{ success: boolean; message: string }> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return { success: false, message: 'ログインが必要です' };

    const perShare = Number(annualDividendPerShareForeign);
    if (!Number.isFinite(perShare) || perShare < 0) {
        return { success: false, message: '分配金の金額が正しくありません' };
    }

    const months = Array.from(new Set(dividendMonths.filter(month => month >= 1 && month <= 12))).sort((a, b) => a - b);

    const { error } = await supabase
        .from('overseas_holdings')
        .update({
            annual_dividend_per_share_foreign: perShare,
            dividend_months: months,
            updated_at: new Date().toISOString(),
        })
        .eq('id', holdingId)
        .eq('user_id', user.id);

    if (error) {
        console.error('Overseas Holding Dividend Update Error:', error);
        return { success: false, message: '分配金情報の更新に失敗しました' };
    }

    return { success: true, message: '分配金情報を更新しました' };
}

export async function deleteOverseasHolding(holdingId: string): Promise<{ success: boolean; message: string }> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return { success: false, message: 'ログインが必要です' };

    const { error } = await supabase
        .from('overseas_holdings')
        .delete()
        .eq('id', holdingId)
        .eq('user_id', user.id);

    if (error) {
        console.error('Overseas Holding Delete Error:', error);
        return { success: false, message: '削除に失敗しました' };
    }

    return { success: true, message: '銘柄を削除しました' };
}

export async function deleteAllOverseasHoldings(): Promise<{ success: boolean; message: string }> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return { success: false, message: 'ログインが必要です' };

    const { error } = await supabase
        .from('overseas_holdings')
        .delete()
        .eq('user_id', user.id);

    if (error) {
        console.error('Overseas Holdings Delete All Error:', error);
        return { success: false, message: '削除に失敗しました' };
    }

    return { success: true, message: '海外銘柄をすべて削除しました' };
}

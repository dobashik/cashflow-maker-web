'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ClipboardPaste, Globe2, Loader2, Pencil, Plus, Save, Trash2, TrendingUp } from 'lucide-react';
import { parseSBIOverseasHoldingsPaste } from '@/utils/csvParser';
import {
    deleteAllOverseasHoldings,
    deleteOverseasHolding,
    getOverseasHoldings,
    saveOverseasHoldings,
    updateOverseasHoldingDividend,
} from '@/app/actions/overseasActions';
import {
    KNOWN_DIVIDEND_MONTHS,
    OVERSEAS_ACCOUNT_TYPES,
    SAMPLE_OVERSEAS_HOLDINGS,
    annualDividendForeign,
    annualNetDividendJpy,
    effectiveFxRate,
    formatForeign,
    formatJpy,
    netDividendFactor,
    totalAnnualNetDividendJpy,
    totalGainLossJpy,
    totalValuationJpy,
} from '@/lib/overseas';
import type { OverseasAccountType, OverseasHolding } from '@/lib/overseas';

type OverseasHoldingsProps = {
    isSampleMode?: boolean;
    onDataUpdate?: (holdings: OverseasHolding[]) => void;
};

type DraftHolding = OverseasHolding & { clientId: string };

const PASTE_PLACEHOLDER = `SBI証券の「外貨建商品 保有証券」の表をドラッグして選択し、コピーしたものをそのまま貼り付けてください。

例：
バンガード 米国高配当株式ETF
VYM NYSE Arca
159.26 USD
25,054 円
32
...`;

const MONTH_LABELS = Array.from({ length: 12 }, (_, index) => index + 1);

const toDrafts = (holdings: OverseasHolding[]): DraftHolding[] => holdings.map((holding, index) => ({
    ...holding,
    clientId: `${holding.ticker}-${holding.accountType}-${index}`,
}));

const emptyDraft = (index: number): DraftHolding => ({
    clientId: `manual-${Date.now()}-${index}`,
    ticker: '',
    name: '',
    exchange: '',
    currency: 'USD',
    accountType: '特定',
    quantity: 0,
    priceForeign: 0,
    priceJpy: 0,
    acquisitionPriceForeign: 0,
    acquisitionPriceJpy: 0,
    valuationForeign: 0,
    valuationJpy: 0,
    gainLossForeign: 0,
    gainLossJpy: 0,
    fxRate: 0,
    annualDividendPerShareForeign: 0,
    dividendMonths: [],
});

/** 為替レートや数量の変更を評価額・損益に反映させる */
const recalcDraft = (draft: DraftHolding): DraftHolding => {
    const valuationForeign = draft.priceForeign * draft.quantity;
    const acquisitionForeign = draft.acquisitionPriceForeign * draft.quantity;
    const gainLossForeign = valuationForeign - acquisitionForeign;
    const fxRate = draft.fxRate > 0 ? draft.fxRate : 0;

    return {
        ...draft,
        valuationForeign,
        gainLossForeign,
        priceJpy: draft.priceForeign * fxRate,
        acquisitionPriceJpy: draft.acquisitionPriceForeign * fxRate,
        valuationJpy: valuationForeign * fxRate,
        gainLossJpy: gainLossForeign * fxRate,
    };
};

export function OverseasHoldings({ isSampleMode = false, onDataUpdate }: OverseasHoldingsProps) {
    const [holdings, setHoldings] = useState<OverseasHolding[]>(() => (isSampleMode ? SAMPLE_OVERSEAS_HOLDINGS : []));
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');

    // 取り込みモーダル
    const [isImportOpen, setIsImportOpen] = useState(false);
    const [pasteText, setPasteText] = useState('');
    const [drafts, setDrafts] = useState<DraftHolding[]>([]);
    const [parseWarnings, setParseWarnings] = useState<string[]>([]);
    const [importMode, setImportMode] = useState<'replace' | 'merge'>('replace');

    // 分配金の編集
    const [editingHolding, setEditingHolding] = useState<OverseasHolding | null>(null);
    const [editPerShare, setEditPerShare] = useState(0);
    const [editMonths, setEditMonths] = useState<number[]>([]);

    const loadHoldings = useCallback(async () => {
        if (isSampleMode) return;

        setIsLoading(true);
        setError('');
        const result = await getOverseasHoldings();
        if (result.success) {
            setHoldings(result.holdings);
        } else {
            setError(result.message || '海外銘柄の取得に失敗しました');
        }
        setIsLoading(false);
    }, [isSampleMode]);

    useEffect(() => {
        void loadHoldings();
    }, [loadHoldings]);

    useEffect(() => {
        onDataUpdate?.(holdings);
    }, [holdings, onDataUpdate]);

    const summary = useMemo(() => ({
        valuation: totalValuationJpy(holdings),
        gainLoss: totalGainLossJpy(holdings),
        annualNetDividend: totalAnnualNetDividendJpy(holdings),
        fxRate: effectiveFxRate(holdings),
    }), [holdings]);

    const dividendUnset = holdings.filter(holding => holding.annualDividendPerShareForeign <= 0);

    /** 貼り付けテキストを読み取ってプレビュー行を作る */
    const applyParse = useCallback((text: string) => {
        setError('');
        setMessage('');
        const result = parseSBIOverseasHoldingsPaste(text);
        setParseWarnings(result.warnings);

        if (result.holdings.length === 0) {
            setDrafts([]);
            setError('銘柄を読み取れませんでした。表の見出しごと、まとめてコピーしてみてください。');
            return;
        }

        setDrafts(toDrafts(result.holdings.map(holding => ({
            ...holding,
            accountType: holding.accountType as OverseasAccountType,
            annualDividendPerShareForeign: 0,
            dividendMonths: KNOWN_DIVIDEND_MONTHS[holding.ticker] || [],
        }))));
    }, []);

    const updateDraft = (clientId: string, patch: Partial<DraftHolding>) => {
        setDrafts(prev => prev.map(draft => (
            draft.clientId === clientId ? recalcDraft({ ...draft, ...patch }) : draft
        )));
    };

    const handleSaveDrafts = async () => {
        if (isSampleMode) return;

        const invalid = drafts.filter(draft => !draft.ticker || draft.quantity <= 0 || draft.fxRate <= 0);
        if (invalid.length > 0) {
            setError('ティッカー・保有数量・為替レートを入力してください');
            return;
        }

        setIsSaving(true);
        setError('');
        const result = await saveOverseasHoldings(drafts, importMode);
        setIsSaving(false);

        if (!result.success) {
            setError(result.message);
            return;
        }

        setMessage(result.message);
        setIsImportOpen(false);
        setPasteText('');
        setDrafts([]);
        setParseWarnings([]);
        await loadHoldings();
    };

    const handleSaveDividend = async () => {
        if (!editingHolding?.id || isSampleMode) return;

        setIsSaving(true);
        const result = await updateOverseasHoldingDividend(editingHolding.id, editPerShare, editMonths);
        setIsSaving(false);

        if (!result.success) {
            setError(result.message);
            return;
        }

        setMessage(result.message);
        setEditingHolding(null);
        await loadHoldings();
    };

    const handleDelete = async (holding: OverseasHolding) => {
        if (!holding.id || isSampleMode) return;

        setIsSaving(true);
        const result = await deleteOverseasHolding(holding.id);
        setIsSaving(false);

        if (!result.success) {
            setError(result.message);
            return;
        }
        setMessage(result.message);
        await loadHoldings();
    };

    const handleDeleteAll = async () => {
        if (isSampleMode) return;

        setIsSaving(true);
        const result = await deleteAllOverseasHoldings();
        setIsSaving(false);

        if (!result.success) {
            setError(result.message);
            return;
        }
        setMessage(result.message);
        await loadHoldings();
    };

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            {/* サマリー */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <SummaryTile
                    label="海外資産の評価額"
                    value={formatJpy(summary.valuation)}
                    sub={holdings.length > 0 ? `${holdings.length}銘柄` : '未登録'}
                />
                <SummaryTile
                    label="含み損益"
                    value={`${summary.gainLoss >= 0 ? '+' : ''}${formatJpy(summary.gainLoss)}`}
                    tone={summary.gainLoss >= 0 ? 'emerald' : 'rose'}
                />
                <SummaryTile
                    label="年間分配金の見込み"
                    value={formatJpy(summary.annualNetDividend)}
                    sub="税引後（米国10%＋国内20.315%）"
                    tone="amber"
                />
                <SummaryTile
                    label="為替レート"
                    value={summary.fxRate > 0 ? `1USD = ¥${summary.fxRate.toFixed(2)}` : '—'}
                    sub="証券会社の円換算額から算出"
                />
            </div>

            {(message || error) && (
                <div className={`mt-4 rounded-xl p-3 text-sm font-bold ${error ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>
                    {error || message}
                </div>
            )}

            {dividendUnset.length > 0 && (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                    <span className="font-bold">{dividendUnset.map(holding => holding.ticker).join('、')}</span>
                    {' '}の1口あたり年間分配金が未設定です。鉛筆アイコンから入力すると、毎月の配当金に上積みされます。
                </div>
            )}

            {/* 操作 */}
            <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                    type="button"
                    onClick={() => {
                        setIsImportOpen(true);
                        setError('');
                        setMessage('');
                    }}
                    disabled={isSampleMode}
                    className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-amber-200 transition-transform hover:scale-105 hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    <ClipboardPaste className="h-4 w-4" />
                    SBIの画面から貼り付けて取り込む
                </button>
                {holdings.length > 0 && !isSampleMode && (
                    <button
                        type="button"
                        onClick={() => void handleDeleteAll()}
                        className="inline-flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200"
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                        すべて削除
                    </button>
                )}
                {isSampleMode && (
                    <span className="text-xs font-bold text-slate-400">サンプル表示です。ログインすると自分の海外ETFを取り込めます。</span>
                )}
            </div>

            {/* 一覧 */}
            <div className="mt-4 min-h-0 flex-grow overflow-auto rounded-xl border border-slate-100">
                {isLoading ? (
                    <div className="flex h-48 items-center justify-center gap-2 text-sm text-slate-500">
                        <Loader2 className="h-4 w-4 animate-spin" /> 読み込み中...
                    </div>
                ) : holdings.length === 0 ? (
                    <div className="flex h-48 flex-col items-center justify-center gap-2 text-center text-slate-400">
                        <Globe2 className="h-10 w-10 text-amber-300" />
                        <p className="text-sm font-bold">海外ETFはまだ登録されていません</p>
                        <p className="text-xs">SBI証券の「外貨建商品 保有証券」の表をコピーして貼り付けると取り込めます。</p>
                    </div>
                ) : (
                    <table className="w-full min-w-[980px] border-collapse bg-white text-sm">
                        <thead className="sticky top-0 z-10 bg-slate-50 shadow-sm">
                            <tr className="text-xs font-bold uppercase tracking-wider text-slate-400">
                                <th className="px-4 py-3 text-left">ティッカー</th>
                                <th className="px-4 py-3 text-left">銘柄名</th>
                                <th className="px-4 py-3 text-left">口座</th>
                                <th className="px-4 py-3 text-right">保有数量</th>
                                <th className="px-4 py-3 text-right">現在値</th>
                                <th className="px-4 py-3 text-right">評価額</th>
                                <th className="px-4 py-3 text-right">損益</th>
                                <th className="px-4 py-3 text-right">年間分配金</th>
                                <th className="px-4 py-3 text-right">操作</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {holdings.map((holding, index) => (
                                <motion.tr
                                    key={holding.id || `${holding.ticker}-${holding.accountType}`}
                                    initial={{ opacity: 0, x: -12 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: index * 0.05 }}
                                    className="group transition-colors hover:bg-amber-50/50"
                                >
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-2">
                                            <span className="rounded bg-amber-100 px-2 py-1 font-mono text-xs font-black text-amber-700">
                                                {holding.ticker}
                                            </span>
                                            <span className="text-[10px] text-slate-400">{holding.exchange}</span>
                                        </div>
                                    </td>
                                    <td className="max-w-[220px] truncate px-4 py-3 font-bold text-slate-800" title={holding.name}>
                                        {holding.name}
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${holding.accountType === 'NISA'
                                            ? 'bg-emerald-50 text-emerald-700'
                                            : 'bg-slate-100 text-slate-600'
                                            }`}>
                                            {holding.accountType}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-right font-mono text-slate-700">{holding.quantity.toLocaleString()}</td>
                                    <td className="px-4 py-3 text-right">
                                        <div className="font-mono text-slate-800">{formatForeign(holding.priceForeign, holding.currency)}</div>
                                        <div className="text-[10px] text-slate-400">{formatJpy(holding.priceJpy)}</div>
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <div className="font-bold text-slate-800">{formatJpy(holding.valuationJpy)}</div>
                                        <div className="text-[10px] text-slate-400">{formatForeign(holding.valuationForeign, holding.currency)}</div>
                                    </td>
                                    <td className={`px-4 py-3 text-right font-bold ${holding.gainLossJpy >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                        {holding.gainLossJpy >= 0 ? '+' : ''}{formatJpy(holding.gainLossJpy)}
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        {holding.annualDividendPerShareForeign > 0 ? (
                                            <>
                                                <div className="font-bold text-amber-700">{formatJpy(annualNetDividendJpy(holding))}</div>
                                                <div className="text-[10px] text-slate-400">
                                                    税引前 {formatForeign(annualDividendForeign(holding), holding.currency)}
                                                </div>
                                                {holding.dividendMonths.length > 0 && (
                                                    <div className="text-[10px] text-slate-400">{holding.dividendMonths.join('・')}月</div>
                                                )}
                                            </>
                                        ) : (
                                            <span className="text-xs text-slate-400">未設定</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <div className="flex justify-end gap-1">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setEditingHolding(holding);
                                                    setEditPerShare(holding.annualDividendPerShareForeign);
                                                    setEditMonths(holding.dividendMonths);
                                                }}
                                                disabled={isSampleMode}
                                                className="rounded-lg p-2 text-slate-400 hover:bg-amber-100 hover:text-amber-700 disabled:cursor-not-allowed disabled:opacity-40"
                                                title="分配金を設定"
                                            >
                                                <Pencil className="h-4 w-4" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => void handleDelete(holding)}
                                                disabled={isSampleMode}
                                                className="rounded-lg p-2 text-slate-400 hover:bg-rose-100 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-40"
                                                title="削除"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        </div>
                                    </td>
                                </motion.tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* 取り込みモーダル */}
            {isImportOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-indigo-950/40 p-4 backdrop-blur-sm">
                    <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
                        <div className="flex items-start justify-between gap-4 border-b border-amber-100 bg-gradient-to-r from-amber-50 to-yellow-50 p-6">
                            <div>
                                <h3 className="flex items-center gap-2 text-2xl font-black text-amber-900">
                                    <Globe2 className="h-6 w-6 text-amber-500" />
                                    海外ETFを取り込む
                                </h3>
                                <p className="mt-1 text-sm text-amber-800/80">
                                    SBI証券の「外貨建商品 保有証券」の表を、見出しの行ごとドラッグしてコピー → 下の欄に貼り付けてください。
                                    円換算額から為替レートを自動で計算します。
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsImportOpen(false)}
                                className="rounded-full bg-white/70 px-4 py-2 text-sm font-bold text-slate-600 hover:bg-white"
                            >
                                閉じる
                            </button>
                        </div>

                        <div className="flex-1 overflow-auto p-6">
                            <textarea
                                value={pasteText}
                                onChange={(event) => setPasteText(event.target.value)}
                                onPaste={(event) => {
                                    // 貼り付けたらその場で読み取る（ボタンを押さなくてよい）
                                    const text = event.clipboardData.getData('text');
                                    if (!text) return;
                                    event.preventDefault();
                                    setPasteText(text);
                                    applyParse(text);
                                }}
                                id="overseas-paste-area"
                                rows={6}
                                placeholder={PASTE_PLACEHOLDER}
                                className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 font-mono text-xs text-slate-700 outline-none focus:border-amber-300 focus:ring-2 focus:ring-amber-100"
                            />

                            <div className="mt-3 flex flex-wrap items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => applyParse(pasteText)}
                                    className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-sm font-bold text-white hover:bg-amber-600"
                                >
                                    <ClipboardPaste className="h-4 w-4" /> 読み取る
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setDrafts(prev => [...prev, emptyDraft(prev.length)])}
                                    className="inline-flex items-center gap-2 rounded-xl bg-slate-100 px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-200"
                                >
                                    <Plus className="h-4 w-4" /> 手入力で追加
                                </button>
                            </div>

                            {parseWarnings.length > 0 && (
                                <ul className="mt-3 space-y-1 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
                                    {parseWarnings.map(warning => (
                                        <li key={warning}>・{warning}</li>
                                    ))}
                                </ul>
                            )}

                            {drafts.length > 0 && (
                                <div className="mt-5">
                                    <div className="mb-2 flex items-center justify-between">
                                        <h4 className="font-bold text-slate-800">読み取った内容の確認（{drafts.length}銘柄）</h4>
                                        <div className="flex gap-2 text-xs font-bold">
                                            <label className="inline-flex cursor-pointer items-center gap-1.5 text-slate-600">
                                                <input
                                                    type="radio"
                                                    checked={importMode === 'replace'}
                                                    onChange={() => setImportMode('replace')}
                                                    className="h-3.5 w-3.5 text-amber-500"
                                                />
                                                入れ替える
                                            </label>
                                            <label className="inline-flex cursor-pointer items-center gap-1.5 text-slate-600">
                                                <input
                                                    type="radio"
                                                    checked={importMode === 'merge'}
                                                    onChange={() => setImportMode('merge')}
                                                    className="h-3.5 w-3.5 text-amber-500"
                                                />
                                                追加・更新する
                                            </label>
                                        </div>
                                    </div>

                                    <div className="overflow-auto rounded-xl border border-slate-200">
                                        <table className="w-full min-w-[900px] text-sm">
                                            <thead className="bg-slate-50 text-xs text-slate-500">
                                                <tr>
                                                    <th className="px-3 py-2 text-left">ティッカー</th>
                                                    <th className="px-3 py-2 text-left">銘柄名</th>
                                                    <th className="px-3 py-2 text-left">口座</th>
                                                    <th className="px-3 py-2 text-right">数量</th>
                                                    <th className="px-3 py-2 text-right">現在値(USD)</th>
                                                    <th className="px-3 py-2 text-right">取得単価(USD)</th>
                                                    <th className="px-3 py-2 text-right">為替レート</th>
                                                    <th className="px-3 py-2 text-right">評価額(円)</th>
                                                    <th className="px-3 py-2"></th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {drafts.map(draft => (
                                                    <tr key={draft.clientId}>
                                                        <td className="px-3 py-2">
                                                            <input
                                                                value={draft.ticker}
                                                                onChange={(event) => updateDraft(draft.clientId, { ticker: event.target.value.toUpperCase() })}
                                                                className="w-24 rounded-lg border border-slate-200 px-2 py-1 font-mono text-xs font-bold uppercase"
                                                                placeholder="VYM"
                                                            />
                                                        </td>
                                                        <td className="px-3 py-2">
                                                            <input
                                                                value={draft.name}
                                                                onChange={(event) => updateDraft(draft.clientId, { name: event.target.value })}
                                                                className="w-52 rounded-lg border border-slate-200 px-2 py-1 text-xs"
                                                                placeholder="銘柄名"
                                                            />
                                                        </td>
                                                        <td className="px-3 py-2">
                                                            <select
                                                                value={draft.accountType}
                                                                onChange={(event) => updateDraft(draft.clientId, { accountType: event.target.value as OverseasAccountType })}
                                                                className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-bold"
                                                            >
                                                                {OVERSEAS_ACCOUNT_TYPES.map(type => (
                                                                    <option key={type} value={type}>{type}</option>
                                                                ))}
                                                            </select>
                                                        </td>
                                                        <td className="px-3 py-2 text-right">
                                                            <input
                                                                type="number"
                                                                value={draft.quantity || ''}
                                                                onChange={(event) => updateDraft(draft.clientId, { quantity: Number(event.target.value) })}
                                                                className="w-20 rounded-lg border border-slate-200 px-2 py-1 text-right text-xs"
                                                            />
                                                        </td>
                                                        <td className="px-3 py-2 text-right">
                                                            <input
                                                                type="number"
                                                                step="0.01"
                                                                value={draft.priceForeign || ''}
                                                                onChange={(event) => updateDraft(draft.clientId, { priceForeign: Number(event.target.value) })}
                                                                className="w-24 rounded-lg border border-slate-200 px-2 py-1 text-right text-xs"
                                                            />
                                                        </td>
                                                        <td className="px-3 py-2 text-right">
                                                            <input
                                                                type="number"
                                                                step="0.01"
                                                                value={draft.acquisitionPriceForeign || ''}
                                                                onChange={(event) => updateDraft(draft.clientId, { acquisitionPriceForeign: Number(event.target.value) })}
                                                                className="w-24 rounded-lg border border-slate-200 px-2 py-1 text-right text-xs"
                                                            />
                                                        </td>
                                                        <td className="px-3 py-2 text-right">
                                                            <input
                                                                type="number"
                                                                step="0.01"
                                                                value={draft.fxRate ? Number(draft.fxRate.toFixed(2)) : ''}
                                                                onChange={(event) => updateDraft(draft.clientId, { fxRate: Number(event.target.value) })}
                                                                className={`w-24 rounded-lg border px-2 py-1 text-right text-xs ${draft.fxRate > 0 ? 'border-slate-200' : 'border-rose-300 bg-rose-50'}`}
                                                                placeholder="157.32"
                                                            />
                                                        </td>
                                                        <td className="px-3 py-2 text-right font-bold text-slate-700">
                                                            {formatJpy(draft.valuationJpy)}
                                                        </td>
                                                        <td className="px-3 py-2 text-right">
                                                            <button
                                                                type="button"
                                                                onClick={() => setDrafts(prev => prev.filter(item => item.clientId !== draft.clientId))}
                                                                className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-100 hover:text-rose-600"
                                                            >
                                                                <Trash2 className="h-3.5 w-3.5" />
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>

                                    <p className="mt-2 text-xs text-slate-500">
                                        為替レートは証券会社の円換算額から逆算した実効レートです。円換算額が含まれていない場合は手入力してください。
                                    </p>
                                </div>
                            )}
                        </div>

                        <div className="flex items-center justify-between gap-3 border-t border-slate-100 bg-slate-50 p-4">
                            <div className="text-xs text-slate-500">
                                {drafts.length > 0 && `合計評価額 ${formatJpy(drafts.reduce((sum, draft) => sum + draft.valuationJpy, 0))}`}
                            </div>
                            <button
                                type="button"
                                onClick={() => void handleSaveDrafts()}
                                disabled={drafts.length === 0 || isSaving}
                                className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-amber-200 hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                {isSaving ? '取り込み中...' : 'この内容で取り込む'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 分配金の編集モーダル */}
            {editingHolding && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-indigo-950/40 p-4 backdrop-blur-sm">
                    <div className="w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-2xl">
                        <div className="border-b border-amber-100 bg-amber-50 p-6">
                            <h3 className="text-xl font-black text-amber-900">
                                {editingHolding.ticker} の分配金を設定
                            </h3>
                            <p className="mt-1 text-xs text-amber-800/80">{editingHolding.name}</p>
                        </div>

                        <div className="space-y-5 p-6">
                            <div>
                                <label className="text-xs font-bold text-slate-500">1口あたりの年間分配金（税引前・{editingHolding.currency}）</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={editPerShare || ''}
                                    onChange={(event) => setEditPerShare(Number(event.target.value))}
                                    className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-3 text-right font-mono text-lg font-bold text-slate-800 outline-none focus:border-amber-300 focus:ring-2 focus:ring-amber-100"
                                    placeholder="3.52"
                                />
                                <p className="mt-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
                                    年間の受取見込み: <span className="font-bold text-amber-700">
                                        {formatJpy(editPerShare * editingHolding.quantity * editingHolding.fxRate * netDividendFactor(editingHolding.accountType))}
                                    </span>
                                    <br />
                                    税引前 {formatForeign(editPerShare * editingHolding.quantity, editingHolding.currency)}
                                    {editingHolding.accountType === 'NISA'
                                        ? ' → 米国10%のみ課税（国内は非課税）'
                                        : ' → 米国10%＋国内20.315%'}
                                </p>
                            </div>

                            <div>
                                <label className="text-xs font-bold text-slate-500">分配月</label>
                                <div className="mt-2 grid grid-cols-6 gap-2">
                                    {MONTH_LABELS.map(month => {
                                        const isSelected = editMonths.includes(month);
                                        return (
                                            <button
                                                key={month}
                                                type="button"
                                                onClick={() => setEditMonths(prev => (
                                                    isSelected ? prev.filter(item => item !== month) : [...prev, month].sort((a, b) => a - b)
                                                ))}
                                                className={`rounded-xl py-2 text-xs font-bold transition-colors ${isSelected
                                                    ? 'bg-amber-500 text-white shadow-sm'
                                                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                                                    }`}
                                            >
                                                {month}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-2 border-t border-slate-100 bg-slate-50 p-4">
                            <button
                                type="button"
                                onClick={() => setEditingHolding(null)}
                                className="flex-1 rounded-xl bg-white px-4 py-3 text-sm font-bold text-slate-600 hover:bg-slate-100"
                            >
                                キャンセル
                            </button>
                            <button
                                type="button"
                                onClick={() => void handleSaveDividend()}
                                disabled={isSaving}
                                className="flex-1 rounded-xl bg-amber-500 px-4 py-3 text-sm font-bold text-white hover:bg-amber-600 disabled:opacity-50"
                            >
                                {isSaving ? '保存中...' : '保存する'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function SummaryTile({ label, value, sub, tone = 'slate' }: {
    label: string;
    value: string;
    sub?: string;
    tone?: 'slate' | 'emerald' | 'rose' | 'amber';
}) {
    const toneClass = {
        slate: 'bg-slate-50 text-slate-700',
        emerald: 'bg-emerald-50 text-emerald-700',
        rose: 'bg-rose-50 text-rose-700',
        amber: 'bg-amber-50 text-amber-700',
    }[tone];

    return (
        <div className={`rounded-2xl p-4 ${toneClass}`}>
            <div className="flex items-center gap-2 text-xs font-bold opacity-80">
                <TrendingUp className="h-3.5 w-3.5" />
                {label}
            </div>
            <div className="mt-1.5 text-xl font-black">{value}</div>
            {sub && <div className="mt-1 text-[10px] font-bold opacity-70">{sub}</div>}
        </div>
    );
}

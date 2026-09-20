// 海外（米国ETFなど）の保有銘柄まわりの型と計算ロジック。
// 日本株の Holding とは通貨・税制が異なるため、別の型として扱う。

export type OverseasAccountType = '特定' | 'NISA' | '一般';

export const OVERSEAS_ACCOUNT_TYPES: OverseasAccountType[] = ['特定', 'NISA', '一般'];

export type OverseasHolding = {
    id?: string;
    ticker: string;
    name: string;
    exchange: string;
    currency: string;
    accountType: OverseasAccountType;
    quantity: number;
    /** 現在値（外貨） */
    priceForeign: number;
    /** 現在値（円換算） */
    priceJpy: number;
    acquisitionPriceForeign: number;
    acquisitionPriceJpy: number;
    valuationForeign: number;
    valuationJpy: number;
    gainLossForeign: number;
    gainLossJpy: number;
    /** 1外貨あたりの円（SBIの円換算額から逆算した実効レート） */
    fxRate: number;
    /** 1口あたりの年間分配金（外貨・税引前）。ユーザーが入力する。 */
    annualDividendPerShareForeign: number;
    /** 分配金が支払われる月（1-12） */
    dividendMonths: number[];
    dataDate?: string;
};

/**
 * 米国株の分配金にかかる税率。
 * 特定・一般口座: 米国10% → 残りに国内20.315%
 * NISA口座: 米国10%のみ（国内は非課税）
 */
export const US_WITHHOLDING_RATE = 0.1;
export const JP_TAX_RATE = 0.20315;

export const netDividendFactor = (accountType: OverseasAccountType): number => (
    accountType === 'NISA'
        ? 1 - US_WITHHOLDING_RATE
        : (1 - US_WITHHOLDING_RATE) * (1 - JP_TAX_RATE)
);

/** 年間分配金の見込み（外貨・税引前） */
export const annualDividendForeign = (holding: OverseasHolding): number => (
    holding.quantity * holding.annualDividendPerShareForeign
);

/** 年間分配金の見込み（円・税引後）。カバー率は手取りベースで揃える。 */
export const annualNetDividendJpy = (holding: OverseasHolding): number => (
    annualDividendForeign(holding) * holding.fxRate * netDividendFactor(holding.accountType)
);

export const totalValuationJpy = (holdings: OverseasHolding[]): number => (
    holdings.reduce((sum, holding) => sum + holding.valuationJpy, 0)
);

export const totalGainLossJpy = (holdings: OverseasHolding[]): number => (
    holdings.reduce((sum, holding) => sum + holding.gainLossJpy, 0)
);

export const totalAnnualNetDividendJpy = (holdings: OverseasHolding[]): number => (
    holdings.reduce((sum, holding) => sum + annualNetDividendJpy(holding), 0)
);

/** 保有銘柄から算出した実効為替レートの平均（評価額で加重） */
export const effectiveFxRate = (holdings: OverseasHolding[]): number => {
    const weighted = holdings.reduce((acc, holding) => {
        if (!holding.fxRate || holding.valuationForeign <= 0) return acc;
        return {
            rateSum: acc.rateSum + holding.fxRate * holding.valuationForeign,
            weight: acc.weight + holding.valuationForeign,
        };
    }, { rateSum: 0, weight: 0 });

    return weighted.weight > 0 ? weighted.rateSum / weighted.weight : 0;
};

export const formatForeign = (amount: number, currency = 'USD'): string => (
    `${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`
);

export const formatJpy = (amount: number): string => `¥${Math.round(amount).toLocaleString()}`;

/** 主要な米国高配当ETFの分配月。取り込み時の初期値として使う。 */
export const KNOWN_DIVIDEND_MONTHS: Record<string, number[]> = {
    VYM: [3, 6, 9, 12],
    HDV: [3, 6, 9, 12],
    SPYD: [3, 6, 9, 12],
    VIG: [3, 6, 9, 12],
    SCHD: [3, 6, 9, 12],
    DGRO: [3, 6, 9, 12],
    VTI: [3, 6, 9, 12],
    VOO: [3, 6, 9, 12],
    JEPI: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    QYLD: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
};

/** サンプルモードで表示する海外ETF。実データがなくても演出を確認できるようにする。 */
export const SAMPLE_OVERSEAS_HOLDINGS: OverseasHolding[] = [
    {
        ticker: 'VYM',
        name: 'バンガード 米国高配当株式ETF',
        exchange: 'NYSE Arca',
        currency: 'USD',
        accountType: 'NISA',
        quantity: 320,
        priceForeign: 159.26,
        priceJpy: 25054,
        acquisitionPriceForeign: 135.86,
        acquisitionPriceJpy: 20836,
        valuationForeign: 50963.2,
        valuationJpy: 8017530,
        gainLossForeign: 7488,
        gainLossJpy: 1350010,
        fxRate: 157.3,
        annualDividendPerShareForeign: 3.52,
        dividendMonths: [3, 6, 9, 12],
    },
    {
        ticker: 'HDV',
        name: 'iシェアーズ コア 米国高配当株ETF',
        exchange: 'NYSE Arca',
        currency: 'USD',
        accountType: '特定',
        quantity: 150,
        priceForeign: 118.4,
        priceJpy: 18624,
        acquisitionPriceForeign: 104.2,
        acquisitionPriceJpy: 16391,
        valuationForeign: 17760,
        valuationJpy: 2793648,
        gainLossForeign: 2130,
        gainLossJpy: 335049,
        fxRate: 157.3,
        annualDividendPerShareForeign: 4.36,
        dividendMonths: [3, 6, 9, 12],
    },
    {
        ticker: 'SPYD',
        name: 'SPDR ポートフォリオ S&P 500 高配当株式ETF',
        exchange: 'NYSE Arca',
        currency: 'USD',
        accountType: '特定',
        quantity: 400,
        priceForeign: 42.18,
        priceJpy: 6635,
        acquisitionPriceForeign: 38.9,
        acquisitionPriceJpy: 6119,
        valuationForeign: 16872,
        valuationJpy: 2654164,
        gainLossForeign: 1312,
        gainLossJpy: 206378,
        fxRate: 157.3,
        annualDividendPerShareForeign: 1.92,
        dividendMonths: [3, 6, 9, 12],
    },
];

/** サンプルモードの海外分配金（円・税引後の年間見込み） */
export const SAMPLE_OVERSEAS_ANNUAL_DIVIDEND = Math.round(
    totalAnnualNetDividendJpy(SAMPLE_OVERSEAS_HOLDINGS)
);

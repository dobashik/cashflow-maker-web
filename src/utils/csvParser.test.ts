import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
    detectDividendCsvKind,
    parseSBICSV,
    parseSBIDividendPaymentCSV,
    parseSBIForeignDividendCSV,
    parseSBIOverseasHoldingsPaste,
} from './csvParser';

const readTestData = (name: string) => readFileSync(join(process.cwd(), 'test-data', name), 'utf8');

describe('parseSBICSV', () => {
    it('reads holdings from the SBI portfolio export', () => {
        const holdings = parseSBICSV(readTestData('sbi-history-test-01.csv'));

        expect(holdings.length).toBeGreaterThan(0);
        expect(holdings[0]).toMatchObject({
            code: '2914',
            name: '日本たばこ産業',
            quantity: 100,
            acquisitionPrice: 3800,
            price: 4200,
            totalGainLoss: 40000,
            source: 'SBI',
            accountType: 'Specific',
        });
    });

    it('switches account type by section and skips totals', () => {
        const csv = [
            '特定預り',
            '銘柄（コード）,保有株数,取得単価,現在値,評価損益',
            '2914 日本たばこ産業,100,3800,4200,40000',
            '合計,,,,40000',
            'NISA預り',
            '銘柄（コード）,保有株数,取得単価,現在値,評価損益',
            '8058 三菱商事,"1,200",2500,2800,"360,000"',
        ].join('\n');

        const holdings = parseSBICSV(csv);

        expect(holdings.map(h => [h.code, h.accountType, h.quantity])).toEqual([
            ['2914', 'Specific', 100],
            ['8058', 'NISA', 1200],
        ]);
        expect(holdings[1].totalGainLoss).toBe(360000);
    });

    it('returns nothing when the header is missing', () => {
        expect(parseSBICSV('foo,bar\n1,2')).toEqual([]);
    });
});

describe('parseSBIDividendPaymentCSV', () => {
    const csv = [
        '"入出金日","取引","区分","摘要","出金額","入金額"',
        '"2026/3/5","入金","利金・配当金","株式配当金 日本たばこ産業（NISA：非課税）","","9,600"',
        '"2026/3/10","入金","利金・配当金","株式配当金 三菱商事","","2,391"',
        '"2026/3/11","入金","ポイント","Vポイント","","100"',
        '"2026/3/12","出金","利金・配当金","調整","500",""',
    ].join('\n');

    it('keeps dividend deposits only', () => {
        const payments = parseSBIDividendPaymentCSV(csv);

        expect(payments).toHaveLength(2);
        expect(payments[0]).toMatchObject({
            paymentDate: '2026-03-05',
            stockName: '日本たばこ産業',
            amount: 9600,
            taxCategory: 'NISA',
        });
        expect(payments[1]).toMatchObject({ stockName: '三菱商事', amount: 2391, taxCategory: 'Taxable' });
    });

    it('gives identical rows the same fingerprint so re-imports can be deduplicated', () => {
        const first = parseSBIDividendPaymentCSV(csv);
        const second = parseSBIDividendPaymentCSV(csv);

        expect(second.map(p => p.sourceFingerprint)).toEqual(first.map(p => p.sourceFingerprint));
        expect(new Set(first.map(p => p.sourceFingerprint)).size).toBe(first.length);
    });
});

describe('detectDividendCsvKind', () => {
    it('distinguishes domestic and overseas dividend CSVs', () => {
        expect(detectDividendCsvKind('入出金日,取引,区分,摘要,入金額')).toBe('JP');
        expect(detectDividendCsvKind('"受渡日","口座","商品","銘柄名","数量","受取額(税引後・円)"')).toBe('US');
        expect(detectDividendCsvKind('日付,金額')).toBeNull();
    });
});

describe('parseSBIForeignDividendCSV', () => {
    const csv = [
        '"検索件数","3"',
        '"受渡日","2026/01/01-2026/09/19"',
        '"種類","米国株式"',
        '',
        '"商品","受取額(税引後・円)","受取額(税引後・USD)"',
        '"米国株式","10,662.97","68.12"',
        '',
        '"受渡日","口座","商品","銘柄名","数量","受取額(税引後・円)"',
        '"2026/03/28","NISA（成長投資枠）","米国株式","バンガード 米国高配当株式ETF VYM","320","4,532.97"',
        '"2026/03/31","特定","米国株式","iシェアーズ コア 米国高配当株ETF HDV","150","6,130"',
        '"2026/03/31","特定","国内株式","日本たばこ産業","100","9,600"',
    ].join('\n');

    it('reads overseas rows and excludes domestic ones to avoid double counting', () => {
        const payments = parseSBIForeignDividendCSV(csv);

        expect(payments).toHaveLength(2);
        expect(payments[0]).toMatchObject({
            market: 'US',
            paymentDate: '2026-03-28',
            ticker: 'VYM',
            amount: 4532.97,
            quantity: 320,
            taxCategory: 'NISA',
        });
        expect(payments[1]).toMatchObject({ ticker: 'HDV', amount: 6130, taxCategory: 'Taxable' });
    });
});

describe('parseSBIOverseasHoldingsPaste', () => {
    const paste = [
        'NISA口座',
        'バンガード 米国高配当株式ETF',
        'VYM NYSE Arca',
        '159.26 USD',
        '25,054 円',
        '320',
        '(0)',
        '135.86 USD',
        '20,836 円',
        '43,475.20 USD',
        '6,667,520 円',
        '50,963.20 USD',
        '8,017,530 円',
        '+7,488.00 USD',
        '+1,350,010 円',
    ].join('\n');

    it('reads a holding block and derives the fx rate from yen values', () => {
        const { holdings, warnings } = parseSBIOverseasHoldingsPaste(paste);

        expect(warnings).toEqual([]);
        expect(holdings).toHaveLength(1);
        expect(holdings[0]).toMatchObject({
            ticker: 'VYM',
            name: 'バンガード 米国高配当株式ETF',
            exchange: 'NYSE Arca',
            accountType: 'NISA',
            quantity: 320,
            priceForeign: 159.26,
            priceJpy: 25054,
            acquisitionPriceForeign: 135.86,
            valuationForeign: 50963.2,
            valuationJpy: 8017530,
            gainLossJpy: 1350010,
        });
        expect(holdings[0].fxRate).toBeCloseTo(8017530 / 50963.2, 6);
    });

    it('accepts tab separated rows', () => {
        const { holdings } = parseSBIOverseasHoldingsPaste(paste.replace(/\n/g, '\t'));

        expect(holdings.map(h => h.ticker)).toEqual(['VYM']);
    });

    it('warns instead of guessing when nothing can be read', () => {
        const { holdings, warnings } = parseSBIOverseasHoldingsPaste('ただの文章です');

        expect(holdings).toEqual([]);
        expect(warnings).toHaveLength(1);
    });
});

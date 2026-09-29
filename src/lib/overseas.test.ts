import { describe, expect, it } from 'vitest';

import {
    annualNetDividendJpy,
    effectiveFxRate,
    netDividendFactor,
    SAMPLE_OVERSEAS_HOLDINGS,
    type OverseasHolding,
} from './overseas';

const holding = (overrides: Partial<OverseasHolding>): OverseasHolding => ({
    ...SAMPLE_OVERSEAS_HOLDINGS[0],
    ...overrides,
});

describe('netDividendFactor', () => {
    it('applies only the US withholding tax in NISA accounts', () => {
        expect(netDividendFactor('NISA')).toBeCloseTo(0.9, 10);
    });

    it('applies US and Japanese tax in taxable accounts', () => {
        expect(netDividendFactor('特定')).toBeCloseTo(0.9 * (1 - 0.20315), 10);
        expect(netDividendFactor('一般')).toBe(netDividendFactor('特定'));
    });
});

describe('annualNetDividendJpy', () => {
    it('converts the after-tax annual dividend to yen', () => {
        const nisa = holding({ quantity: 100, annualDividendPerShareForeign: 3, fxRate: 150, accountType: 'NISA' });

        expect(annualNetDividendJpy(nisa)).toBeCloseTo(100 * 3 * 150 * 0.9, 6);
    });
});

describe('effectiveFxRate', () => {
    it('weights each rate by foreign valuation', () => {
        const rate = effectiveFxRate([
            holding({ fxRate: 150, valuationForeign: 1000 }),
            holding({ fxRate: 160, valuationForeign: 3000 }),
        ]);

        expect(rate).toBeCloseTo(157.5, 10);
    });

    it('returns 0 when no holding has a usable rate', () => {
        expect(effectiveFxRate([holding({ fxRate: 0 })])).toBe(0);
        expect(effectiveFxRate([])).toBe(0);
    });
});

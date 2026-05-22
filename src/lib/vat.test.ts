import { describe, it, expect } from 'vitest';
import { vatBreakdown, coerceVatRate, DEFAULT_VAT_RATE } from './vat';

describe('coerceVatRate', () => {
  it('passes through valid rates', () => {
    expect(coerceVatRate(5)).toBe(5);
    expect(coerceVatRate(19)).toBe(19);
  });

  it('falls back to default for invalid / null / undefined', () => {
    expect(coerceVatRate(null)).toBe(DEFAULT_VAT_RATE);
    expect(coerceVatRate(undefined)).toBe(DEFAULT_VAT_RATE);
    expect(coerceVatRate(13)).toBe(DEFAULT_VAT_RATE);
    expect(coerceVatRate(0)).toBe(DEFAULT_VAT_RATE);
  });
});

describe('vatBreakdown', () => {
  it('returns a single row when all lines share one rate', () => {
    const rows = vatBreakdown([
      { net: 100, vat_rate: 19 },
      { net: 200, vat_rate: 19 },
    ]);
    expect(rows).toEqual([{ rate: 19, net: 300, amount: 57 }]);
  });

  it('returns rows ordered 5% then 19%', () => {
    const rows = vatBreakdown([
      { net: 100, vat_rate: 19 },
      { net: 200, vat_rate: 5 },
    ]);
    expect(rows.map((r) => r.rate)).toEqual([5, 19]);
    expect(rows[0]).toEqual({ rate: 5, net: 200, amount: 10 });
    expect(rows[1]).toEqual({ rate: 19, net: 100, amount: 19 });
  });

  it('coerces unknown rates to the default', () => {
    const rows = vatBreakdown([
      { net: 100, vat_rate: 7 },        // unknown → 19%
      { net: 50, vat_rate: 19 },
    ]);
    expect(rows).toEqual([{ rate: 19, net: 150, amount: 28.5 }]);
  });

  it('omits zero-net lines', () => {
    const rows = vatBreakdown([
      { net: 0, vat_rate: 19 },
      { net: 100, vat_rate: 5 },
    ]);
    expect(rows).toEqual([{ rate: 5, net: 100, amount: 5 }]);
  });

  it('returns an empty array for an empty input', () => {
    expect(vatBreakdown([])).toEqual([]);
  });
});

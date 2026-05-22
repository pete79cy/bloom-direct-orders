/**
 * VAT helpers — single source of truth for VAT computation across
 * the wizard, order detail, and PDF.
 *
 * Cyprus VAT rates used: 5% (reduced — edible plants, herbs) and
 * 19% (standard — ornamentals). Default for new lines is 19%.
 */

export type VatRate = 5 | 19;

export const VAT_RATES: VatRate[] = [5, 19];
export const DEFAULT_VAT_RATE: VatRate = 19;

export const VAT_LABEL: Record<VatRate, string> = {
  5: 'ΦΠΑ 5%',
  19: 'ΦΠΑ 19%',
};

/**
 * Coerce arbitrary vat_rate values (from DB or null) to one of our
 * supported rates. Anything else falls back to the default.
 */
export function coerceVatRate(raw: number | null | undefined): VatRate {
  if (raw === 5) return 5;
  if (raw === 19) return 19;
  return DEFAULT_VAT_RATE;
}

export interface VatBreakdownRow {
  rate: VatRate;
  net: number;     // taxable base for this rate
  amount: number;  // VAT due for this rate
}

interface LineForVat {
  net: number;
  vat_rate: number;
}

/**
 * Group lines by VAT rate and return one row per non-zero rate.
 * Rows are sorted by rate ascending (5% before 19%).
 *
 * If only one rate is present, only that row is returned — keeping the
 * totals block clean when an order uses a single rate.
 */
export function vatBreakdown(lines: readonly LineForVat[]): VatBreakdownRow[] {
  const byRate = new Map<VatRate, { net: number; amount: number }>();
  for (const l of lines) {
    if (l.net === 0) continue;
    const rate = coerceVatRate(l.vat_rate);
    const cur = byRate.get(rate) ?? { net: 0, amount: 0 };
    cur.net += l.net;
    cur.amount += l.net * (rate / 100);
    byRate.set(rate, cur);
  }
  return [...byRate.entries()]
    .map(([rate, v]) => ({ rate, ...v }))
    .sort((a, b) => a.rate - b.rate);
}

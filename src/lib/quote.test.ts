import { describe, expect, it } from 'vitest';
import {
  applyPriceScope, buildNewQuotePayload, buildQuoteMessage, buildQuoteUpdatePayload,
  canTransition, displayQuoteStatus, draftLineToQuoteLine, isQuoteExpired, makeQuoteId,
  quoteTotals, unmatchedLines, unpricedLineNos,
} from './quote';
import { localDayKey } from './format';
import type { DraftLine } from './draft-line';
import type { QuoteLine } from '@/types';

const cat: DraftLine = {
  variant_id: 'v-1', qty: 10, unit_price: 45, price_source: 'customer', vat_rate: 19, description: 'χωρίς γλάστρα',
};
const free: DraftLine = {
  variant_id: 'draft-1', qty: 50, unit_price: 3.2, price_source: 'override', vat_rate: 5, description: '',
  draft: { name: ' Λεβάντα ', size: 'P 2L ' },
};

function line(p: Partial<QuoteLine>): QuoteLine {
  return {
    id: 'ql', quote_id: 'q', line_no: 1, offered_variant_id: 'v-1', qty: 1, unit_sell_price: 10,
    discount_pct: 0, vat_rate: 19, description_override: '', ...p,
  };
}

describe('draftLineToQuoteLine', () => {
  it('maps a catalogue line onto quote_lines columns', () => {
    const l = draftLineToQuoteLine(cat, 'q-1', 0);
    expect(l).toMatchObject({
      id: 'ql-q-1-1', line_no: 1, offered_variant_id: 'v-1', qty: 10,
      unit_sell_price: 45, vat_rate: 19, description_override: 'χωρίς γλάστρα', is_alternative: false,
    });
    expect(l.offered_common_name_override).toBeUndefined();
  });
  it('keeps a free-text line unmatched with name + size overrides', () => {
    const l = draftLineToQuoteLine(free, 'q-1', 1);
    expect(l.offered_variant_id).toBeNull();
    expect(l.offered_common_name_override).toBe('Λεβάντα');
    expect(l.requested_spec_text).toBe('P 2L');
    expect(l.line_no).toBe(2);
  });
});

describe('buildNewQuotePayload', () => {
  it('omits quote_number so the server mints it', () => {
    const p = buildNewQuotePayload({
      quoteId: 'q-1', customerId: 'c-1', status: 'SENT', issueDate: '2026-09-27',
      validUntil: '2026-10-27', notes: ' n ', terms: 't', lines: [cat, free],
    });
    expect(p.quote.quote_number).toBeUndefined();
    expect(p.quote).toMatchObject({ id: 'q-1', status: 'SENT', notes: 'n', revision_no: 0, currency: 'EUR' });
    expect(p.lines).toHaveLength(2);
  });
});

describe('buildQuoteUpdatePayload', () => {
  it('round-trips every line, including alternatives, and drops display', () => {
    const lines = [
      line({ id: 'a', display: { plant_common_name: 'x' } as never, offered_pot_l_override: 35 }),
      line({ id: 'b', is_alternative: true }),
    ];
    const p = buildQuoteUpdatePayload({ quote: { id: 'q', status: 'DRAFT' } as never, lines }, { status: 'SENT' });
    expect(p.quote.status).toBe('SENT');
    expect(p.lines.map((l) => l.id)).toEqual(['a', 'b']);
    expect(p.lines[0].display).toBeUndefined();
    expect(p.lines[0].offered_pot_l_override).toBe(35);
    expect(lines[0].display).toBeDefined(); // input not mutated
  });
});

describe('applyPriceScope', () => {
  it('sets price_scope on the deviating line numbers only', () => {
    const p = applyPriceScope({ quote: {} as never, lines: [line({ id: 'a' }), line({ id: 'b' })] }, [2], 'quote');
    expect(p.lines[0].price_scope).toBeUndefined();
    expect(p.lines[1].price_scope).toBe('quote');
  });
});

describe('totals', () => {
  it('sums main lines with discount and splits VAT', () => {
    const t = quoteTotals([
      line({ qty: 10, unit_sell_price: 10, discount_pct: 10, vat_rate: 19 }),
      line({ qty: 2, unit_sell_price: 5, vat_rate: 5 }),
      line({ qty: 99, unit_sell_price: 99, is_alternative: true }),
    ]);
    expect(t.subtotal).toBeCloseTo(100);
    expect(t.breakdown.map((r) => r.rate)).toEqual([5, 19]);
    expect(t.total).toBeCloseTo(100 + 0.5 + 17.1);
  });
});

describe('guards', () => {
  it('unpricedLineNos mirrors the server rule', () => {
    expect(unpricedLineNos([
      line({ line_no: 1, unit_sell_price: 0 }),
      line({ line_no: 2, offered_variant_id: null, unit_sell_price: 0 }),
      line({ line_no: 3, unit_sell_price: 4 }),
    ])).toEqual([1]);
  });
  it('unmatchedLines ignores alternatives', () => {
    expect(unmatchedLines([
      line({ id: 'a', offered_variant_id: null }),
      line({ id: 'b', offered_variant_id: null, is_alternative: true }),
    ]).map((l) => l.id)).toEqual(['a']);
  });
  it('transitions', () => {
    expect(canTransition('DRAFT', 'SENT')).toBe(true);
    expect(canTransition('SENT', 'ACCEPTED')).toBe(true);
    expect(canTransition('ACCEPTED', 'SENT')).toBe(false);
    expect(canTransition('DRAFT', 'ACCEPTED')).toBe(false);
  });
});

describe('expiry', () => {
  it('flags open quotes past validity only', () => {
    expect(isQuoteExpired({ status: 'SENT', valid_until: '2026-09-26' }, '2026-09-27')).toBe(true);
    expect(isQuoteExpired({ status: 'SENT', valid_until: '2026-09-27' }, '2026-09-27')).toBe(false);
    expect(isQuoteExpired({ status: 'ACCEPTED', valid_until: '2020-01-01' }, '2026-09-27')).toBe(false);
    expect(displayQuoteStatus({ status: 'DRAFT', valid_until: '2026-01-01' }, '2026-09-27')).toBe('EXPIRED');
  });
});

describe('localDayKey', () => {
  it('passes plain dates through and converts timestamps to the local day', () => {
    expect(localDayKey('2026-10-27')).toBe('2026-10-27');
    const d = new Date(2026, 9, 27); // local midnight, like node-pg
    expect(localDayKey(d.toISOString())).toBe('2026-10-27');
    expect(localDayKey(null)).toBe('');
  });
});

describe('misc', () => {
  it('makeQuoteId is prefixed and deterministic with injected clock', () => {
    expect(makeQuoteId(1700, () => 0.5)).toBe('q-1700-i');
  });
  it('buildQuoteMessage drops an empty name', () => {
    expect(buildQuoteMessage({ customerName: '', quoteNumber: 'QT-1', total: '€1', validUntil: '1/1' }))
      .toMatch(/^Γεια σας, σας στέλνουμε την προσφορά QT-1/);
  });
});

import { readQuoteSaveError } from './quote';
describe('readQuoteSaveError', () => {
  it('classifies the Bloom rejections', () => {
    expect(readQuoteSaveError({ status: 422, payload: { error: 'GROUP_PRICE_DEVIATIONS', member_count: 2, deviations: [{ line_no: 1 }] } }))
      .toMatchObject({ kind: 'group', memberCount: 2 });
    expect(readQuoteSaveError({ status: 422, payload: { error: 'UNPRICED_LINES', line_nos: [3], message: 'x' } }))
      .toEqual({ kind: 'unpriced', lineNos: [3], message: 'x' });
    expect(readQuoteSaveError({ status: 409, payload: { error: 'QUOTE_LOCKED' } }).kind).toBe('locked');
    expect(readQuoteSaveError(new Error('boom'))).toEqual({ kind: 'other', message: 'boom' });
  });
});

import { compareQuotesNewestFirst } from './quote';
describe('compareQuotesNewestFirst', () => {
  it('orders by year then sequence, numerically', () => {
    const nums = ['QT-2026-009', 'QT-2025-120', 'QT-2026-1000', 'QT-2026-010', 'weird']
      .map((quote_number) => ({ quote_number }))
      .sort(compareQuotesNewestFirst)
      .map((q) => q.quote_number);
    expect(nums).toEqual(['QT-2026-1000', 'QT-2026-010', 'QT-2026-009', 'QT-2025-120', 'weird']);
  });
});

import { defaultQuotePdfLanguage, quotePdfPath } from './quote';
describe('Bloom quote PDF', () => {
  it('defaults to Greek only for Greek customers', () => {
    expect(defaultQuotePdfLanguage('EL')).toBe('EL');
    expect(defaultQuotePdfLanguage('EN')).toBe('EN');
    expect(defaultQuotePdfLanguage(undefined)).toBe('EN');
  });
  it('builds the endpoint path', () => {
    expect(quotePdfPath('q 1', 'EL')).toBe('/api/quotes/q%201/pdf?lang=EL&terms=1');
    expect(quotePdfPath('q', 'EN', false)).toBe('/api/quotes/q/pdf?lang=EN&terms=0');
  });
});

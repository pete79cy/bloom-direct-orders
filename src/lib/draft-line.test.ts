import { describe, it, expect } from 'vitest';
import {
  isDraftDraftLine,
  makeLocalDraftId,
  draftLineToPayload,
  type DraftLine,
} from './draft-line';

describe('isDraftDraftLine', () => {
  it('returns true when the line has a draft field', () => {
    const line: DraftLine = {
      variant_id: 'draft-123',
      qty: 1,
      unit_price: 5,
      price_source: 'override',
      vat_rate: 19,
      description: '',
      draft: { name: 'Ficus', size: 'P 5L' },
    };
    expect(isDraftDraftLine(line)).toBe(true);
  });

  it('returns false for a normal cart line', () => {
    const line: DraftLine = {
      variant_id: 'v-real-12345',
      qty: 1,
      unit_price: 5,
      price_source: 'override',
      vat_rate: 19,
      description: '',
    };
    expect(isDraftDraftLine(line)).toBe(false);
  });
});

describe('makeLocalDraftId', () => {
  it('produces ids matching the draft-<ts>-<i> format', () => {
    expect(makeLocalDraftId(0)).toMatch(/^draft-\d+-0$/);
    expect(makeLocalDraftId(7)).toMatch(/^draft-\d+-7$/);
  });

  it('disambiguates by index so two drafts in the same tick differ', () => {
    expect(makeLocalDraftId(0)).not.toEqual(makeLocalDraftId(1));
  });
});

describe('draftLineToPayload', () => {
  it('emits {variant_id} for a normal line', () => {
    const line: DraftLine = {
      variant_id: 'v-12345',
      qty: 3,
      unit_price: 4.5,
      price_source: 'customer',
      vat_rate: 19,
      description: 'note',
    };
    expect(draftLineToPayload(line, 0)).toEqual({
      variant_id: 'v-12345',
      qty: 3,
      unit_price: 4.5,
      vat_rate: 19,
      line_no: 1,
      description: 'note',
    });
  });

  it('emits {draft: {name, size}} for a free-text line, drops local variant_id', () => {
    const line: DraftLine = {
      variant_id: 'draft-9999-0',
      qty: 2,
      unit_price: 8.5,
      price_source: 'override',
      vat_rate: 5,
      description: '',
      draft: { name: 'Ficus benjamina', size: 'P 5L' },
    };
    const payload = draftLineToPayload(line, 3);
    expect(payload).toEqual({
      draft: { name: 'Ficus benjamina', size: 'P 5L' },
      qty: 2,
      unit_price: 8.5,
      vat_rate: 5,
      line_no: 4,
      description: null,
    });
    // Explicitly assert variant_id is absent so the server's XOR validation
    // doesn't reject the line.
    expect('variant_id' in payload).toBe(false);
  });

  it('preserves an empty size as empty string in the payload', () => {
    const line: DraftLine = {
      variant_id: 'draft-1-0',
      qty: 1,
      unit_price: 1,
      price_source: 'override',
      vat_rate: 19,
      description: '',
      draft: { name: 'A name', size: '' },
    };
    expect(draftLineToPayload(line, 0)).toMatchObject({
      draft: { name: 'A name', size: '' },
    });
  });

  it('maps empty description to null (server treats null and empty as equivalent)', () => {
    const line: DraftLine = {
      variant_id: 'v-1',
      qty: 1,
      unit_price: 1,
      price_source: 'default',
      vat_rate: 19,
      description: '',
    };
    expect(draftLineToPayload(line, 0)).toMatchObject({ description: null });
  });
});

import { describe, it, expect } from 'vitest';
import { buildCostMap, marginPct } from './supplier-cost';
import type { SupplierProduct, SupplierPrice } from '@/types';

function sp(overrides: Partial<SupplierProduct>): SupplierProduct {
  return {
    id: 'sp-1',
    supplier_id: 's-1',
    variant_id: 'v-1',
    supplier_sku: '',
    supplier_name_text: '',
    match_confidence: 1,
    ...overrides,
  };
}

function price(overrides: Partial<SupplierPrice>): SupplierPrice {
  return {
    id: 'p-1',
    supplier_product_id: 'sp-1',
    cost_price: 0,
    currency: 'EUR',
    valid_from: '2026-01-01',
    valid_to: null,
    min_qty: 1,
    lead_time_days: 0,
    source: 'price_list',
    captured_at: '2026-05-01',
    ...overrides,
  };
}

describe('buildCostMap', () => {
  it('returns the cost when a single supplier has one current price', () => {
    const map = buildCostMap(
      [sp({ id: 'sp-1', variant_id: 'v-1' })],
      [price({ supplier_product_id: 'sp-1', cost_price: 5.5 })],
    );
    expect(map.get('v-1')).toBe(5.5);
  });

  it('picks the cheapest supplier when a variant has multiple', () => {
    const map = buildCostMap(
      [
        sp({ id: 'sp-1', variant_id: 'v-1' }),
        sp({ id: 'sp-2', variant_id: 'v-1' }),
      ],
      [
        price({ supplier_product_id: 'sp-1', cost_price: 9 }),
        price({ supplier_product_id: 'sp-2', cost_price: 6 }),
      ],
    );
    expect(map.get('v-1')).toBe(6);
  });

  it('keeps the most recent price for a supplier_product (server DESC order)', () => {
    const map = buildCostMap(
      [sp({ id: 'sp-1', variant_id: 'v-1' })],
      [
        // Server sorts captured_at DESC, so this newer one comes first
        price({ id: 'p-new', cost_price: 4 }),
        price({ id: 'p-old', cost_price: 7 }),
      ],
    );
    expect(map.get('v-1')).toBe(4);
  });

  it('ignores expired prices (valid_to before today)', () => {
    const map = buildCostMap(
      [sp({ id: 'sp-1', variant_id: 'v-1' })],
      [
        price({ id: 'p-old', cost_price: 4, valid_to: '2020-01-01' }),
        price({ id: 'p-cur', cost_price: 8 }),
      ],
    );
    expect(map.get('v-1')).toBe(8);
  });

  it('returns no entry when a variant has no supplier_products', () => {
    const map = buildCostMap(
      [sp({ id: 'sp-1', variant_id: 'v-OTHER' })],
      [price({ cost_price: 5 })],
    );
    expect(map.has('v-1')).toBe(false);
  });

  it('returns no entry when supplier_products exist but no prices match', () => {
    const map = buildCostMap(
      [sp({ id: 'sp-1', variant_id: 'v-1' })],
      [],
    );
    expect(map.has('v-1')).toBe(false);
  });
});

describe('marginPct', () => {
  it('computes positive margin', () => {
    expect(marginPct(10, 5)).toBe(100);
    expect(marginPct(6, 4)).toBe(50);
  });

  it('computes negative margin (loss)', () => {
    expect(marginPct(4, 5)).toBe(-20);
  });

  it('returns null when cost is missing or zero', () => {
    expect(marginPct(10, null)).toBeNull();
    expect(marginPct(10, undefined)).toBeNull();
    expect(marginPct(10, 0)).toBeNull();
  });
});

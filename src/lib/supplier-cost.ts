import type { SupplierProduct, SupplierPrice } from '@/types';

/**
 * Build a map from `variant_id` to the lowest current supplier cost.
 *
 * Resolution:
 *   1. Filter out expired supplier_prices (valid_to in the past).
 *   2. For each supplier_product, keep the MOST RECENT current price
 *      (the server already sorts captured_at DESC).
 *   3. For each variant_id, keep the MINIMUM current cost across all
 *      its supplier_products. The lowest cost is the realistic figure
 *      for margin decisions on a new direct order.
 *
 * Cost is shown in the UI alongside the sell price so the user can
 * judge margin while pricing — no extra navigation required.
 */
export function buildCostMap(
  supplierProducts: readonly SupplierProduct[],
  supplierPrices: readonly SupplierPrice[],
): Map<string, number> {
  const today = new Date().toISOString().slice(0, 10);

  // Step 1+2: best current price per supplier_product
  const bySupplierProduct = new Map<string, number>();
  for (const p of supplierPrices) {
    if (p.valid_to && p.valid_to < today) continue;
    if (!bySupplierProduct.has(p.supplier_product_id)) {
      // First time we see this SP — server-sorted DESC means this is the latest
      bySupplierProduct.set(p.supplier_product_id, p.cost_price);
    }
  }

  // Step 3: minimum across suppliers for each variant
  const byVariant = new Map<string, number>();
  for (const sp of supplierProducts) {
    const cost = bySupplierProduct.get(sp.id);
    if (cost === undefined) continue;
    const existing = byVariant.get(sp.variant_id);
    if (existing === undefined || cost < existing) {
      byVariant.set(sp.variant_id, cost);
    }
  }

  return byVariant;
}

/**
 * Gross margin percentage. Returns null when cost is unknown or zero
 * (avoid divide-by-zero and meaningless ∞ displays).
 */
export function marginPct(sell: number, cost: number | null | undefined): number | null {
  if (cost == null || cost <= 0) return null;
  return ((sell - cost) / cost) * 100;
}

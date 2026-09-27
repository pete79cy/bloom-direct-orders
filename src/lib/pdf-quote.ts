/**
 * Quote PDF — maps a QuoteDetail onto the shared sales-document renderer.
 * Customer-facing: Greek name first, validity date prominent, terms at the
 * end. Only main lines are printed (alternatives stay in the desktop).
 * Lazy-imported from Quote Detail to keep the main bundle slim.
 */

import type { QuoteDetail, QuoteLine } from '@/types';
import { prettyScientificName, cleanSizeSummary } from '@/lib/plant-display';
import { fmtLongDate } from '@/lib/format';
import { mainLines, QUOTE_STATUS_LABEL } from '@/lib/quote';
import { renderSalesDocPdf } from '@/lib/pdf-sales-doc';

export function quoteLineName(l: QuoteLine): string {
  const d = l.display;
  const common = d?.plant_common_name?.trim() || '';
  const sci = prettyScientificName(d?.plant_scientific_name ?? null);
  if (common && sci) return `${common} (${sci})`;
  return common || sci || d?.free_text || l.description_override || '—';
}

export async function generateQuotePdf(detail: QuoteDetail): Promise<Blob> {
  const { quote, customer } = detail;
  return renderSalesDocPdf({
    tagline: 'PAKKOUTIS NURSERIES  ·  ΠΡΟΣΦΟΡΑ',
    number: quote.quote_number,
    statusLabel: QUOTE_STATUS_LABEL[quote.status] ?? quote.status,
    customerName: customer?.trading_name || customer?.legal_name || 'Άγνωστος πελάτης',
    customerLegal:
      customer?.trading_name && customer.legal_name !== customer.trading_name
        ? customer.legal_name
        : null,
    metaLabel: 'ΙΣΧΥΕΙ ΕΩΣ',
    metaValue: fmtLongDate(quote.valid_until),
    metaSub: `Έκδοση ${fmtLongDate(quote.issue_date)}`,
    lines: mainLines(detail.lines).map((l) => ({
      name: l.description_override && l.offered_variant_id
        ? `${quoteLineName(l)} · ${l.description_override}`
        : quoteLineName(l),
      size: cleanSizeSummary(l.display?.size_summary ?? null) ?? '—',
      qty: Number(l.qty),
      unit_price: Number(l.unit_sell_price),
      discount_pct: Number(l.discount_pct) || 0,
      vat_rate: Number(l.vat_rate),
    })),
    notes: quote.notes,
    terms: quote.terms,
  });
}

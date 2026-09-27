/**
 * Order PDF — maps an OrderDetail onto the shared sales-document renderer.
 *
 * Serves three audiences in one document:
 *   - Customer copy (company header, customer block, totals with VAT, status)
 *   - Picking list (mono SKU/size, qty in bold)
 *   - Internal archive (everything captured)
 *
 * Lazy-imported from Order Detail to keep the main bundle slim.
 */

import type { OrderDetail } from '@/types';
import { prettyScientificName, cleanSizeSummary } from '@/lib/plant-display';
import { fmtLongDate } from '@/lib/format';
import { renderSalesDocPdf, shareOrDownloadPdf } from '@/lib/pdf-sales-doc';

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Εκκρεμής',
  PREPARING: 'Σε ετοιμασία',
  READY: 'Έτοιμη',
  PARTIALLY_DELIVERED: 'Μερική παράδοση',
  DELIVERED: 'Παραδομένη',
  INVOICED: 'Τιμολογημένη',
  CANCELLED: 'Ακυρωμένη',
};

export async function generateOrderPdf(detail: OrderDetail): Promise<Blob> {
  const customer = detail.customer;
  return renderSalesDocPdf({
    tagline: 'PAKKOUTIS NURSERIES  ·  DIRECT ORDERS',
    number: detail.order.order_number,
    statusLabel: STATUS_LABELS[detail.order.status] ?? detail.order.status,
    customerName: customer?.trading_name || customer?.legal_name || 'Άγνωστος πελάτης',
    customerLegal:
      customer?.trading_name && customer.legal_name !== customer.trading_name
        ? customer.legal_name
        : null,
    metaLabel: 'ΠΑΡΑΔΟΣΗ',
    metaValue: fmtLongDate(detail.order.delivery_date),
    lines: detail.lines.map((l) => ({
      name: prettyScientificName(l.plant_scientific_name) || l.description || l.variant_id,
      size: cleanSizeSummary(l.size_summary) ?? '—',
      qty: l.qty,
      unit_price: l.unit_price,
      discount_pct: l.discount_pct,
      vat_rate: l.vat_rate,
    })),
    notes: detail.order.notes,
  });
}

/**
 * Generate the PDF and try to share via the native share sheet (iOS 15+/
 * modern Chrome). Falls back to triggering a download.
 */
export async function shareOrDownloadOrderPdf(detail: OrderDetail): Promise<'shared' | 'downloaded'> {
  const blob = await generateOrderPdf(detail);
  return shareOrDownloadPdf(
    blob,
    `${detail.order.order_number}.pdf`,
    `Παραγγελία ${detail.order.order_number}`,
  );
}

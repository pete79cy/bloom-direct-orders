/**
 * Order PDF generator — client-side jsPDF.
 *
 * Serves three audiences in one document:
 *   - Customer copy (company header, customer block, totals with VAT, status)
 *   - Picking list (mono SKU/size, qty in bold)
 *   - Internal archive (everything captured)
 *
 * Design language follows the rest of the app: sage + cream, refined
 * hierarchy, hairline rules, plenty of whitespace, restrained color.
 * Greek glyph support via NotoSans (Regular + Bold).
 *
 * Lazy-imported from Order Detail to keep the main bundle slim.
 */

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { OrderDetail, OrderLineEnriched } from '@/types';
import { prettyScientificName, cleanSizeSummary } from '@/lib/plant-display';
import { fmtEUR, fmtLongDate } from '@/lib/format';
import { vatBreakdown, VAT_LABEL, coerceVatRate } from '@/lib/vat';

/* ── Brand colours (RGB triples for jsPDF) ────────────────── */
const SAGE_800 = [30, 51, 41] as const;
const SAGE_700 = [47, 79, 68] as const;
const INK_900  = [27, 31, 28] as const;
const INK_700  = [61, 72, 66] as const;
const INK_500  = [111, 122, 115] as const;
const INK_300  = [168, 176, 170] as const;
const CREAM_200 = [244, 241, 232] as const;
const HONEY    = [198, 142, 59] as const;
const HAIRLINE = [222, 222, 215] as const;

const FONT_FAMILY = 'NotoSans';

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Εκκρεμής',
  PREPARING: 'Σε ετοιμασία',
  READY: 'Έτοιμη',
  PARTIALLY_DELIVERED: 'Μερική παράδοση',
  DELIVERED: 'Παραδομένη',
  INVOICED: 'Τιμολογημένη',
  CANCELLED: 'Ακυρωμένη',
};

/* ── Font loading helpers ────────────────────────────────── */

async function fetchFontBase64(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load font: ${url}`);
  const buf = await res.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

async function registerFonts(doc: jsPDF) {
  const [reg, bold] = await Promise.all([
    fetchFontBase64('/fonts/NotoSans-Regular.ttf'),
    fetchFontBase64('/fonts/NotoSans-Bold.ttf'),
  ]);
  doc.addFileToVFS('NotoSans-Regular.ttf', reg);
  doc.addFont('NotoSans-Regular.ttf', FONT_FAMILY, 'normal');
  doc.addFileToVFS('NotoSans-Bold.ttf', bold);
  doc.addFont('NotoSans-Bold.ttf', FONT_FAMILY, 'bold');
}

/* ── Drawing helpers ──────────────────────────────────────── */

function setFont(doc: jsPDF, weight: 'normal' | 'bold' = 'normal', size = 10) {
  doc.setFont(FONT_FAMILY, weight);
  doc.setFontSize(size);
}
function setColor(doc: jsPDF, rgb: readonly [number, number, number]) {
  doc.setTextColor(rgb[0], rgb[1], rgb[2]);
}
function setFill(doc: jsPDF, rgb: readonly [number, number, number]) {
  doc.setFillColor(rgb[0], rgb[1], rgb[2]);
}
function setDraw(doc: jsPDF, rgb: readonly [number, number, number]) {
  doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
}

/* ── Computation: subtotals + VAT ─────────────────────────── */

interface LineComputed {
  net: number;       // qty × unit_price × (1 − discount/100)
  vat_rate: number;  // coerced to a supported rate
}

function computeLine(l: OrderLineEnriched): LineComputed {
  const discount = l.discount_pct ?? 0;
  const net = l.qty * l.unit_price * (1 - discount / 100);
  return { net, vat_rate: coerceVatRate(l.vat_rate) };
}

/* ── Main entry ───────────────────────────────────────────── */

export async function generateOrderPdf(detail: OrderDetail): Promise<Blob> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  await registerFonts(doc);

  const pageWidth = doc.internal.pageSize.getWidth();   // 210
  const pageHeight = doc.internal.pageSize.getHeight(); // 297
  const margin = 18;
  const contentW = pageWidth - margin * 2;

  /* ── Header ──────────────────────────────────────────
     Restrained: no full-bleed band. Slim sage hairline at the very top
     for brand presence, then company name in sage-800 against the
     cream document. Cleaner, more document-like than a colored banner. */

  // Top hairline accent
  setFill(doc, SAGE_700);
  doc.rect(0, 0, pageWidth, 3, 'F');

  // Company name
  setFont(doc, 'bold', 16);
  setColor(doc, SAGE_800);
  doc.text('Andreas Pakkoutis & Sons Ltd', margin, 18);

  // Tagline — eyebrow
  setFont(doc, 'normal', 7.5);
  setColor(doc, INK_500);
  doc.text('PAKKOUTIS NURSERIES  ·  DIRECT ORDERS', margin, 23.5);

  // Order metadata — right column
  setFont(doc, 'normal', 7.5);
  setColor(doc, INK_500);
  doc.text('ΑΡΙΘΜΟΣ', pageWidth - margin, 13, { align: 'right' });

  setFont(doc, 'bold', 14);
  setColor(doc, INK_900);
  doc.text(detail.order.order_number, pageWidth - margin, 19, { align: 'right' });

  setFont(doc, 'normal', 7.5);
  setColor(doc, INK_500);
  const statusLabel = STATUS_LABELS[detail.order.status] ?? detail.order.status;
  doc.text(`STATUS  ·  ${statusLabel.toUpperCase()}`, pageWidth - margin, 23.5, { align: 'right' });

  // Hairline divider beneath header block
  let y = 32;
  setDraw(doc, HAIRLINE);
  doc.setLineWidth(0.2);
  doc.line(margin, y, pageWidth - margin, y);

  /* ── Customer + Delivery — two-column meta block ────── */
  y = 42;

  // Left column — customer
  setFont(doc, 'normal', 7.5);
  setColor(doc, INK_500);
  doc.text('ΠΕΛΑΤΗΣ', margin, y);

  const customer = detail.customer;
  const customerName = customer?.trading_name || customer?.legal_name || 'Άγνωστος πελάτης';
  const customerLegal =
    customer?.trading_name && customer.legal_name !== customer.trading_name
      ? customer.legal_name
      : null;

  setFont(doc, 'bold', 13);
  setColor(doc, INK_900);
  doc.text(customerName, margin, y + 6);

  if (customerLegal) {
    setFont(doc, 'normal', 9);
    setColor(doc, INK_500);
    doc.text(customerLegal, margin, y + 11);
  }

  // Right column — delivery
  setFont(doc, 'normal', 7.5);
  setColor(doc, INK_500);
  doc.text('ΠΑΡΑΔΟΣΗ', pageWidth - margin, y, { align: 'right' });

  setFont(doc, 'bold', 13);
  setColor(doc, SAGE_700);
  doc.text(fmtLongDate(detail.order.delivery_date), pageWidth - margin, y + 6, { align: 'right' });

  // Spacer
  y = customerLegal ? y + 21 : y + 17;

  /* ── Lines table ────────────────────────────────────── */
  setFont(doc, 'normal', 7.5);
  setColor(doc, INK_500);
  doc.text(`${String(detail.lines.length).padStart(2, '0')}  ΓΡΑΜΜΕΣ`, margin, y);
  y += 4;

  const rows = detail.lines.map((l, i) => {
    const name = prettyScientificName(l.plant_scientific_name) || l.description || l.variant_id;
    const size = cleanSizeSummary(l.size_summary) ?? '—';
    const discount = l.discount_pct ?? 0;
    const { net } = computeLine(l);
    return [
      String(i + 1),                  // # — plain integer, not zero-padded so 1-digit fits
      name,
      size.toUpperCase(),
      String(l.qty),
      fmtEUR(l.unit_price),
      discount > 0 ? `-${discount.toFixed(0)}%` : '',
      fmtEUR(net),
    ];
  });

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [['#', 'ΦΥΤΟ', 'ΜΕΓΕΘΟΣ', 'ΠΟΣ.', 'ΜΟΝ. ΤΙΜΗ', 'ΕΚΠΤ.', 'ΣΥΝΟΛΟ']],
    body: rows,
    theme: 'plain',
    styles: {
      font: FONT_FAMILY,
      fontSize: 9.5,
      cellPadding: { top: 4, right: 4, bottom: 4, left: 4 },
      textColor: INK_900 as unknown as [number, number, number],
      lineColor: HAIRLINE as unknown as [number, number, number],
      lineWidth: 0.1,
      valign: 'middle',
    },
    headStyles: {
      font: FONT_FAMILY,
      fontStyle: 'normal',
      fontSize: 7,
      textColor: INK_500 as unknown as [number, number, number],
      fillColor: [255, 255, 255] as [number, number, number],
      lineColor: HAIRLINE as unknown as [number, number, number],
      lineWidth: { top: 0, right: 0, bottom: 0.4, left: 0 },
      cellPadding: { top: 4, right: 4, bottom: 5, left: 4 },
      // Letter-spacing isn't a jsPDF concept; we emulate by uppercasing
      // and padding with spaces in header strings above (' · ').
    },
    bodyStyles: {
      lineWidth: { top: 0, right: 0, bottom: 0.1, left: 0 },
    },
    columnStyles: {
      0: {
        halign: 'right',
        cellWidth: 12,                     // ← fixes the wrap bug (was 8mm)
        textColor: INK_300 as unknown as [number, number, number],
        fontSize: 9,
      },
      1: { fontStyle: 'bold' },
      2: {
        fontSize: 7.5,
        textColor: INK_500 as unknown as [number, number, number],
        cellWidth: 32,
      },
      3: { halign: 'right', fontStyle: 'bold', cellWidth: 14 },
      4: { halign: 'right', cellWidth: 24 },
      5: {
        halign: 'right',
        textColor: HONEY as unknown as [number, number, number],
        fontSize: 8.5,
        cellWidth: 14,
      },
      6: { halign: 'right', fontStyle: 'bold', cellWidth: 24 },
    },
  });

  // @ts-expect-error — added by the autoTable plugin
  const tableEndY: number = doc.lastAutoTable.finalY;

  /* ── Totals block — breakdown per VAT rate ───────────── */
  const lines = detail.lines;
  const totalQty = lines.reduce((s, l) => s + l.qty, 0);
  const computed = lines.map(computeLine);
  const subtotal = computed.reduce((s, c) => s + c.net, 0);
  const breakdown = vatBreakdown(computed);
  const vatTotal = breakdown.reduce((s, r) => s + r.amount, 0);
  const grandTotal = subtotal + vatTotal;

  let ty = tableEndY + 12;

  // Right-aligned totals stack, breathing room
  const totalsRight = pageWidth - margin;
  const totalsLeft = totalsRight - 80;       // 80mm wide block
  const labelX = totalsLeft + 2;
  const valueX = totalsRight - 2;

  // Items qty — meta line
  setFont(doc, 'normal', 8.5);
  setColor(doc, INK_500);
  doc.text('Σύνολο ποσοτήτων', labelX, ty);
  setFont(doc, 'normal', 8.5);
  setColor(doc, INK_700);
  doc.text(String(totalQty), valueX, ty, { align: 'right' });
  ty += 6;

  // Subtotal (net)
  setFont(doc, 'normal', 9.5);
  setColor(doc, INK_500);
  doc.text('Υποσύνολο', labelX, ty);
  setFont(doc, 'normal', 9.5);
  setColor(doc, INK_900);
  doc.text(fmtEUR(subtotal), valueX, ty, { align: 'right' });
  ty += 5.5;

  // One row per VAT rate present. Includes the taxable base in small
  // ink-300 text alongside the rate label so the customer can verify.
  for (const row of breakdown) {
    setFont(doc, 'normal', 9.5);
    setColor(doc, INK_500);
    doc.text(VAT_LABEL[row.rate], labelX, ty);

    setFont(doc, 'normal', 7);
    setColor(doc, INK_300);
    const labelW = doc.getTextWidth(VAT_LABEL[row.rate]);
    doc.text(`επί ${fmtEUR(row.net)}`, labelX + labelW + 3, ty);

    setFont(doc, 'normal', 9.5);
    setColor(doc, INK_900);
    doc.text(fmtEUR(row.amount), valueX, ty, { align: 'right' });
    ty += 5.5;
  }

  ty += 2.5;

  // Hairline above grand total
  setDraw(doc, INK_300);
  doc.setLineWidth(0.3);
  doc.line(totalsLeft, ty - 4, totalsRight, ty - 4);

  // Grand total — quiet but emphatic. Sage type instead of a colored band.
  setFont(doc, 'bold', 10);
  setColor(doc, SAGE_800);
  doc.text('Σύνολο', labelX, ty + 2);
  setFont(doc, 'bold', 16);
  setColor(doc, SAGE_800);
  doc.text(fmtEUR(grandTotal), valueX, ty + 2, { align: 'right' });
  ty += 12;

  /* ── Notes (if any) ──────────────────────────────────── */
  if (detail.order.notes && detail.order.notes.trim()) {
    if (ty > pageHeight - 52) {
      doc.addPage();
      ty = margin + 10;
    } else {
      ty += 4;
    }
    setFont(doc, 'normal', 7.5);
    setColor(doc, INK_500);
    doc.text('ΣΗΜΕΙΩΣΕΙΣ', margin, ty);
    ty += 4;
    setFill(doc, CREAM_200);
    const noteLines = doc.splitTextToSize(detail.order.notes.trim(), contentW - 10);
    const noteBoxH = Math.max(14, noteLines.length * 5 + 8);
    doc.roundedRect(margin, ty, contentW, noteBoxH, 2, 2, 'F');
    setFont(doc, 'normal', 10);
    setColor(doc, INK_700);
    doc.text(noteLines, margin + 5, ty + 7);
    ty += noteBoxH + 6;
  }

  /* ── Footer (every page) ─────────────────────────────── */
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);

    // Hairline
    setDraw(doc, HAIRLINE);
    doc.setLineWidth(0.1);
    doc.line(margin, pageHeight - 16, pageWidth - margin, pageHeight - 16);

    // Left — company contact line
    setFont(doc, 'normal', 7);
    setColor(doc, INK_500);
    doc.text(
      'Andreas Pakkoutis & Sons Ltd  ·  smartquotations.eu',
      margin,
      pageHeight - 10,
    );

    // Right — page number
    setColor(doc, INK_300);
    setFont(doc, 'normal', 7);
    doc.text(
      `${i} / ${pageCount}`,
      pageWidth - margin,
      pageHeight - 10,
      { align: 'right' },
    );
  }

  return doc.output('blob');
}

/**
 * Generate the PDF and try to share via the native share sheet (iOS 15+/
 * modern Chrome). Falls back to triggering a download.
 */
export async function shareOrDownloadOrderPdf(detail: OrderDetail): Promise<'shared' | 'downloaded'> {
  const blob = await generateOrderPdf(detail);
  const filename = `${detail.order.order_number}.pdf`;
  const file = new File([blob], filename, { type: 'application/pdf' });

  if (
    typeof navigator !== 'undefined' &&
    'canShare' in navigator &&
    navigator.canShare?.({ files: [file] }) &&
    'share' in navigator
  ) {
    try {
      await navigator.share({
        files: [file],
        title: `Παραγγελία ${detail.order.order_number}`,
      });
      return 'shared';
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') return 'shared';
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 'downloaded';
}

/**
 * Order PDF generator — client-side jsPDF.
 *
 * Serves three audiences in one document:
 *   - Customer copy (logo, customer block, totals, status)
 *   - Picking list (mono SKU/size, qty in larger weight, scientific names)
 *   - Internal archive (everything captured)
 *
 * Greek glyph support via NotoSans (Regular + Bold), loaded from /fonts/.
 * The fonts ship in /public/fonts/ — bundled into dist by Vite.
 *
 * Lazy-imported from Order Detail to keep the main bundle slim.
 */

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { OrderDetail, OrderLineEnriched } from '@/types';
import { prettyScientificName, cleanSizeSummary } from '@/lib/plant-display';
import { fmtEUR, fmtLongDate } from '@/lib/format';

/* ── Brand colours (RGB, jsPDF style) ─────────────────────── */
const SAGE_700 = [47, 79, 68] as const;
const SAGE_50  = [244, 247, 243] as const;
const INK_900  = [27, 31, 28] as const;
const INK_700  = [61, 72, 66] as const;
const INK_500  = [111, 122, 115] as const;
const INK_300  = [168, 176, 170] as const;
const CREAM_200 = [244, 241, 232] as const;
const HONEY    = [198, 142, 59] as const;

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

async function fetchFontBase64(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load font: ${url}`);
  const buf = await res.arrayBuffer();
  // Convert to base64 — chunked to avoid call-stack overflow on large buffers
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

/* ── Main entry ───────────────────────────────────────────── */

export async function generateOrderPdf(detail: OrderDetail): Promise<Blob> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  await registerFonts(doc);

  const pageWidth = doc.internal.pageSize.getWidth();   // 210
  const pageHeight = doc.internal.pageSize.getHeight(); // 297
  const margin = 16;
  const contentW = pageWidth - margin * 2;

  /* ── Header band ─────────────────────────────────────── */
  setFill(doc, SAGE_700);
  doc.rect(0, 0, pageWidth, 28, 'F');

  // Wordmark
  setFont(doc, 'bold', 20);
  doc.setTextColor(253, 252, 248); // cream-50
  doc.text('Bloom Orders', margin, 16);

  setFont(doc, 'normal', 8);
  doc.setTextColor(220, 230, 222);
  doc.text('PAKKOUTIS NURSERIES · DIRECT ORDERS', margin, 22);

  // Order number, top-right, mono-feeling
  setFont(doc, 'bold', 14);
  doc.setTextColor(253, 252, 248);
  doc.text(detail.order.order_number, pageWidth - margin, 16, { align: 'right' });

  setFont(doc, 'normal', 8);
  doc.setTextColor(220, 230, 222);
  doc.text(
    `STATUS · ${(STATUS_LABELS[detail.order.status] ?? detail.order.status).toUpperCase()}`,
    pageWidth - margin,
    22,
    { align: 'right' },
  );

  /* ── Customer + Delivery block ─────────────────────── */
  let y = 42;

  setFont(doc, 'normal', 8);
  setColor(doc, INK_500);
  doc.text('ΠΕΛΑΤΗΣ', margin, y);

  const customer = detail.customer;
  const customerName = customer?.trading_name || customer?.legal_name || 'Άγνωστος πελάτης';
  const customerLegal = customer?.trading_name && customer?.legal_name !== customer?.trading_name
    ? customer.legal_name
    : null;

  y += 5;
  setFont(doc, 'bold', 14);
  setColor(doc, INK_900);
  doc.text(customerName, margin, y);

  if (customerLegal) {
    y += 5;
    setFont(doc, 'normal', 9);
    setColor(doc, INK_500);
    doc.text(customerLegal, margin, y);
  }

  // Delivery date — right column
  setFont(doc, 'normal', 8);
  setColor(doc, INK_500);
  doc.text('ΠΑΡΑΔΟΣΗ', pageWidth - margin, 42, { align: 'right' });

  setFont(doc, 'bold', 12);
  setColor(doc, SAGE_700);
  doc.text(fmtLongDate(detail.order.delivery_date), pageWidth - margin, 48, { align: 'right' });

  // Hairline divider
  y = 64;
  setDraw(doc, INK_300);
  doc.setLineWidth(0.2);
  doc.line(margin, y, pageWidth - margin, y);

  /* ── Lines table ─────────────────────────────────────── */
  y += 8;

  setFont(doc, 'normal', 8);
  setColor(doc, INK_500);
  doc.text(`${String(detail.lines.length).padStart(2, '0')} ΓΡΑΜΜΕΣ`, margin, y);

  y += 3;

  const rows = detail.lines.map((l: OrderLineEnriched, i) => {
    const name = prettyScientificName(l.plant_scientific_name) || l.description || l.variant_id;
    const size = cleanSizeSummary(l.size_summary) ?? '—';
    const discount = l.discount_pct ?? 0;
    const subtotal = l.qty * l.unit_price * (1 - discount / 100);
    return [
      String(i + 1).padStart(2, '0'),
      name,
      size.toUpperCase(),
      String(l.qty),
      fmtEUR(l.unit_price),
      discount > 0 ? `-${discount.toFixed(0)}%` : '',
      fmtEUR(subtotal),
    ];
  });

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [['#', 'Φυτό', 'Μέγεθος', 'Ποσ.', 'Μον. τιμή', 'Έκπτ.', 'Σύνολο']],
    body: rows,
    theme: 'plain',
    styles: {
      font: FONT_FAMILY,
      fontSize: 9,
      cellPadding: { top: 3, right: 3, bottom: 3, left: 3 },
      textColor: INK_900 as unknown as [number, number, number],
      lineColor: [232, 232, 226] as [number, number, number],
      lineWidth: 0.1,
    },
    headStyles: {
      font: FONT_FAMILY,
      fontStyle: 'bold',
      fontSize: 7,
      textColor: INK_500 as unknown as [number, number, number],
      fillColor: SAGE_50 as unknown as [number, number, number],
      lineColor: [232, 232, 226] as [number, number, number],
      lineWidth: 0.1,
      cellPadding: { top: 4, right: 3, bottom: 4, left: 3 },
    },
    columnStyles: {
      0: { halign: 'right', cellWidth: 8, textColor: INK_300 as unknown as [number, number, number] },
      1: { fontStyle: 'bold' },
      2: { fontSize: 7.5, textColor: INK_500 as unknown as [number, number, number] },
      3: { halign: 'right', fontStyle: 'bold' },
      4: { halign: 'right' },
      5: { halign: 'right', textColor: HONEY as unknown as [number, number, number], fontSize: 8 },
      6: { halign: 'right', fontStyle: 'bold' },
    },
    didDrawCell: (data) => {
      // Highlight discounted rows subtly
      if (data.section === 'body' && data.column.index === 5 && data.cell.text[0]) {
        // No-op — keeping as a hook if we want amber backgrounds later
      }
    },
  });

  // @ts-expect-error — lastAutoTable is added by the autoTable plugin
  const tableEndY: number = doc.lastAutoTable.finalY;

  /* ── Totals block ────────────────────────────────────── */
  const lines = detail.lines;
  const totalQty = lines.reduce((s, l) => s + l.qty, 0);
  const subtotal = lines.reduce((s, l) => {
    const discount = l.discount_pct ?? 0;
    return s + l.qty * l.unit_price * (1 - discount / 100);
  }, 0);
  // VAT info — bloom-crm tracks vat_rate per line; sum the line-level VAT.
  const vatAmount = lines.reduce((s, l) => {
    const discount = l.discount_pct ?? 0;
    const net = l.qty * l.unit_price * (1 - discount / 100);
    return s + net * ((l.vat_rate ?? 0) / 100);
  }, 0);
  const grandTotal = subtotal + vatAmount;
  const hasVat = vatAmount > 0;

  let ty = tableEndY + 8;

  // Right-aligned totals
  const totalsX = pageWidth - margin;
  const labelX = totalsX - 40;

  setFont(doc, 'normal', 9);
  setColor(doc, INK_500);
  doc.text('Σύνολο ποσοτήτων', labelX, ty);
  setFont(doc, 'bold', 9);
  setColor(doc, INK_900);
  doc.text(String(totalQty), totalsX, ty, { align: 'right' });
  ty += 6;

  if (hasVat) {
    setFont(doc, 'normal', 9);
    setColor(doc, INK_500);
    doc.text('Υποσύνολο', labelX, ty);
    setFont(doc, 'normal', 9);
    setColor(doc, INK_900);
    doc.text(fmtEUR(subtotal), totalsX, ty, { align: 'right' });
    ty += 5;

    setFont(doc, 'normal', 9);
    setColor(doc, INK_500);
    doc.text('ΦΠΑ', labelX, ty);
    setFont(doc, 'normal', 9);
    setColor(doc, INK_900);
    doc.text(fmtEUR(vatAmount), totalsX, ty, { align: 'right' });
    ty += 6;
  }

  // Grand total — sage band
  setFill(doc, SAGE_700);
  doc.rect(labelX - 4, ty - 5, totalsX - (labelX - 4), 10, 'F');
  setFont(doc, 'bold', 11);
  doc.setTextColor(253, 252, 248);
  doc.text('Σύνολο', labelX, ty + 2);
  setFont(doc, 'bold', 13);
  doc.text(fmtEUR(grandTotal), totalsX - 2, ty + 2, { align: 'right' });
  ty += 14;

  /* ── Notes (if any) ──────────────────────────────────── */
  if (detail.order.notes && detail.order.notes.trim()) {
    if (ty > pageHeight - 50) {
      doc.addPage();
      ty = margin;
    }
    setFont(doc, 'normal', 8);
    setColor(doc, INK_500);
    doc.text('ΣΗΜΕΙΩΣΕΙΣ', margin, ty);
    ty += 5;
    setFill(doc, CREAM_200);
    const noteLines = doc.splitTextToSize(detail.order.notes.trim(), contentW - 8);
    const noteBoxH = Math.max(12, noteLines.length * 5 + 6);
    doc.roundedRect(margin, ty - 2, contentW, noteBoxH, 2, 2, 'F');
    setFont(doc, 'normal', 10);
    setColor(doc, INK_700);
    doc.text(noteLines, margin + 4, ty + 4);
    ty += noteBoxH + 4;
  }

  /* ── Footer (every page) ─────────────────────────────── */
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    setDraw(doc, INK_300);
    doc.setLineWidth(0.1);
    doc.line(margin, pageHeight - 14, pageWidth - margin, pageHeight - 14);

    setFont(doc, 'normal', 7);
    setColor(doc, INK_500);
    doc.text(
      'Pakkoutis Nurseries · smartquotations.eu · Andreas Pakkoutis & Sons Ltd',
      margin,
      pageHeight - 9,
    );
    setColor(doc, INK_300);
    doc.text(`Σελίδα ${i} / ${pageCount}`, pageWidth - margin, pageHeight - 9, {
      align: 'right',
    });
  }

  return doc.output('blob');
}

/**
 * Convenience: generate the PDF, then either share via the Web Share API
 * (preferred — opens iOS/Android native share sheet so the user can send
 * via WhatsApp/email/etc) or fall back to triggering a download.
 */
export async function shareOrDownloadOrderPdf(detail: OrderDetail): Promise<'shared' | 'downloaded'> {
  const blob = await generateOrderPdf(detail);
  const filename = `${detail.order.order_number}.pdf`;
  const file = new File([blob], filename, { type: 'application/pdf' });

  // Web Share API with files — supported on iOS 15+ Safari and modern Chrome
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
      // User cancelled — that's fine, fall through to download
      if ((err as DOMException)?.name === 'AbortError') return 'shared';
      // Other share errors — fall back to download
    }
  }

  // Download fallback
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke after a tick so the download has a chance to start
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 'downloaded';
}

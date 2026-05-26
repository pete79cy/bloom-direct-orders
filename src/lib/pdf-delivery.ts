/**
 * Delivery-note PDF generators — Δελτίο αποστολής, Με τιμές, Visual list.
 *
 * Mirrors bloom-crm/src/lib/pdf-utils.ts:
 *   - generateDeliverySlipPDF       (formal Δελτίο αποστολής, no prices)
 *   - generatePricedDeliveryNotePDF (Με τιμές + totals)
 *   - generateVisualPickingListPDF  (one row per line with photo)
 *
 * All three share a company header, customer block, and footer pattern.
 * Each function can either build a fresh document OR append a new page to
 * an existing one — that's how the "all together" combined PDF works:
 *
 *   const doc = await buildSlipDoc(detail);
 *   await appendPricedSection(doc, detail);
 *   await appendVisualSection(doc, detail, photos);
 *
 * Greek glyphs via NotoSans (Regular + Bold), loaded from /fonts/.
 */

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { OrderDetail } from '@/types';
import { prettyScientificName, cleanSizeSummary, sizeDetailsString } from '@/lib/plant-display';
import { fmtEUR, fmtLongDate } from '@/lib/format';
import { vatBreakdown, VAT_LABEL, coerceVatRate } from '@/lib/vat';

/* ── Brand colours ────────────────────────────────────────── */
const GREEN: [number, number, number] = [30, 70, 50];
const SAGE_800: [number, number, number] = [30, 51, 41];
const INK_900: [number, number, number] = [27, 31, 28];
const INK_500: [number, number, number] = [111, 122, 115];
const INK_300: [number, number, number] = [168, 176, 170];

const FONT_FAMILY = 'NotoSans';

const COMPANY = {
  name: 'Andreas Pakkoutis & Sons Ltd',
  address: 'Griva Digeni 39',
  phone: 'Phone: 99564330',
  email: 'Email: panayiotis@pakkoutis.com',
};

/* ── Font loading helpers (shared, single fetch per session) ── */

let fontsCachePromise: Promise<{ reg: string; bold: string }> | null = null;

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

async function loadFonts() {
  if (!fontsCachePromise) {
    fontsCachePromise = Promise.all([
      fetchFontBase64('/fonts/NotoSans-Regular.ttf'),
      fetchFontBase64('/fonts/NotoSans-Bold.ttf'),
    ]).then(([reg, bold]) => ({ reg, bold }));
  }
  return fontsCachePromise;
}

async function registerFonts(doc: jsPDF) {
  const { reg, bold } = await loadFonts();
  doc.addFileToVFS('NotoSans-Regular.ttf', reg);
  doc.addFont('NotoSans-Regular.ttf', FONT_FAMILY, 'normal');
  doc.addFileToVFS('NotoSans-Bold.ttf', bold);
  doc.addFont('NotoSans-Bold.ttf', FONT_FAMILY, 'bold');
}

/* ── Tiny styling helpers ───────────────────────────────── */

function setFont(doc: jsPDF, weight: 'normal' | 'bold' = 'normal', size = 10) {
  doc.setFont(FONT_FAMILY, weight);
  doc.setFontSize(size);
}
function setColor(doc: jsPDF, rgb: readonly [number, number, number]) {
  doc.setTextColor(rgb[0], rgb[1], rgb[2]);
}
function setDraw(doc: jsPDF, rgb: readonly [number, number, number]) {
  doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
}

/* ── Shared header + footer ─────────────────────────────── */

interface HeaderOpts {
  title: string;                          // big Greek title, right column
  subtitle?: string;                      // optional second line under title
  orderNumber: string;
  dnNumber?: string;
  date: string;                           // ISO date
}

function drawHeader(doc: jsPDF, opts: HeaderOpts) {
  const W = doc.internal.pageSize.getWidth();
  const M = 15;

  // Company block — left
  setFont(doc, 'bold', 16);
  setColor(doc, [30, 30, 30]);
  doc.text(COMPANY.name, M, 20);

  setFont(doc, 'normal', 9);
  setColor(doc, [100, 100, 100]);
  doc.text(COMPANY.address, M, 27);
  doc.text(COMPANY.phone, M, 32);
  doc.text(COMPANY.email, M, 37);

  // Title block — right
  setFont(doc, 'bold', 20);
  setColor(doc, GREEN);
  doc.text(opts.title, W - M, 18, { align: 'right' });
  if (opts.subtitle) {
    doc.text(opts.subtitle, W - M, 27, { align: 'right' });
  }

  // Meta lines under title
  setFont(doc, 'normal', 9);
  setColor(doc, [100, 100, 100]);
  let ty = opts.subtitle ? 35 : 27;
  if (opts.dnNumber) {
    doc.text(`Αριθμός: ${opts.dnNumber}`, W - M, ty, { align: 'right' });
    ty += 5;
  }
  doc.text(`Ημ/νία: ${opts.date.slice(0, 10)}`, W - M, ty, { align: 'right' });
  ty += 5;
  doc.text(`Παραγγελία: ${opts.orderNumber}`, W - M, ty, { align: 'right' });
}

function drawCustomerBlock(doc: jsPDF, detail: OrderDetail, yStart = 49) {
  const W = doc.internal.pageSize.getWidth();
  const M = 15;
  const c = detail.customer;
  const name = c?.trading_name || c?.legal_name || 'Άγνωστος πελάτης';

  setDraw(doc, [200, 200, 200]);
  doc.setLineWidth(0.5);
  doc.line(M, yStart, W - M, yStart);

  setFont(doc, 'bold', 9);
  setColor(doc, [100, 100, 100]);
  doc.text('Πελάτης:', M, yStart + 8);

  setFont(doc, 'bold', 12);
  setColor(doc, [30, 30, 30]);
  doc.text(name, M, yStart + 15);
}

function drawFooter(doc: jsPDF) {
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    setFont(doc, 'normal', 8);
    setColor(doc, [150, 150, 150]);
    doc.text(`Σελίδα ${i} / ${pageCount}`, W / 2, H - 10, { align: 'center' });
  }
}

/* ── Mode 1 — Δελτίο αποστολής (no prices) ────────────────── */

interface DeliveryDocMeta {
  /** Sequential DN number — provided by caller (server-assigned). When
   *  omitted we fall back to a deterministic ad-hoc string so the PDF
   *  still has SOMETHING in the slot for not-yet-persisted previews. */
  dnNumber: string;
  /** ISO date — usually order.delivery_date or today. */
  date: string;
  /** Free-text notes that print at the bottom of the doc. */
  notes?: string;
}

export function appendDeliverySlipSection(
  doc: jsPDF,
  detail: OrderDetail,
  meta: DeliveryDocMeta,
) {
  const W = doc.internal.pageSize.getWidth();
  const M = 15;

  drawHeader(doc, {
    title: 'ΔΕΛΤΙΟ',
    subtitle: 'ΑΠΟΣΤΟΛΗΣ',
    orderNumber: detail.order.order_number,
    dnNumber: meta.dnNumber,
    date: meta.date,
  });
  drawCustomerBlock(doc, detail, 49);

  // Lines table — no prices, just qty
  const bodyRows = detail.lines.map((l, i) => {
    const name = prettyScientificName(l.plant_scientific_name) || l.description || '';
    const common = l.plant_common_name?.trim() || '';
    const desc = common && name ? `${common} (${name})` : (common || name);
    const size =
      cleanSizeSummary(l.size_summary) ||
      sizeDetailsString({
        pot_volume_l: (l as unknown as { pot_volume_l?: number | null }).pot_volume_l,
        height_min_cm: (l as unknown as { height_min_cm?: number | null }).height_min_cm,
        height_max_cm: (l as unknown as { height_max_cm?: number | null }).height_max_cm,
        girth_min_cm: (l as unknown as { girth_min_cm?: number | null }).girth_min_cm,
        girth_max_cm: (l as unknown as { girth_max_cm?: number | null }).girth_max_cm,
      }) ||
      '—';
    return [String(i + 1), desc, size, String(l.qty)];
  });

  autoTable(doc, {
    startY: 72,
    head: [['Α/Α', 'Περιγραφή', 'Μέγεθος', 'Ποσ.']],
    body: bodyRows,
    margin: { left: M, right: M },
    styles: {
      fontSize: 11, font: FONT_FAMILY, cellPadding: 4,
      textColor: [30, 30, 30] as [number, number, number],
      lineColor: [210, 210, 210] as [number, number, number],
      lineWidth: { bottom: 0.3, top: 0, left: 0, right: 0 },
    },
    headStyles: {
      fillColor: [245, 245, 245] as [number, number, number],
      textColor: [60, 60, 60] as [number, number, number],
      fontStyle: 'bold', fontSize: 10,
      lineWidth: { bottom: 0.5, top: 0, left: 0, right: 0 },
    },
    alternateRowStyles: { fillColor: [252, 252, 252] as [number, number, number] },
    columnStyles: {
      0: { cellWidth: 14, halign: 'center' },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 45 },
      3: { halign: 'center', cellWidth: 22 },
    },
    rowPageBreak: 'avoid',
  });

  // @ts-expect-error — lastAutoTable is added by autoTable plugin
  const finalY: number = doc.lastAutoTable.finalY;
  const totalQty = detail.lines.reduce((s, l) => s + l.qty, 0);
  setFont(doc, 'bold', 11);
  setColor(doc, [60, 60, 60]);
  doc.text(`Σύνολο τεμαχίων: ${totalQty}`, W - M, finalY + 10, { align: 'right' });

  let endY = finalY + 15;
  if (meta.notes && meta.notes.trim()) {
    endY = drawNotesBlock(doc, meta.notes.trim(), endY + 5);
  }

  drawSignatureLines(doc, endY + 20);
}

function drawNotesBlock(doc: jsPDF, notes: string, y: number): number {
  const W = doc.internal.pageSize.getWidth();
  const M = 15;
  const cW = W - M * 2;
  setFont(doc, 'bold', 9);
  setColor(doc, [100, 100, 100]);
  doc.text('Σημειώσεις:', M, y);
  setFont(doc, 'normal', 10);
  setColor(doc, [60, 60, 60]);
  const noteLines = doc.splitTextToSize(notes, cW);
  doc.text(noteLines, M, y + 6);
  return y + 6 + noteLines.length * 5;
}

function drawSignatureLines(doc: jsPDF, y: number) {
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 15;
  let sigY = y;
  if (sigY + 10 > H - 15) {
    doc.addPage();
    sigY = 30;
  }
  setDraw(doc, [200, 200, 200]);
  doc.setLineWidth(0.3);
  doc.line(M, sigY, M + 60, sigY);
  doc.line(W - M - 60, sigY, W - M, sigY);
  setFont(doc, 'normal', 8);
  setColor(doc, [140, 140, 140]);
  doc.text('Παρέδωσε', M, sigY + 5);
  doc.text('Παρέλαβε', W - M - 60, sigY + 5);
}

/* ── Mode 2 — Με τιμές (priced delivery note) ─────────────── */

export function appendPricedDeliverySection(
  doc: jsPDF,
  detail: OrderDetail,
  meta: DeliveryDocMeta,
) {
  const W = doc.internal.pageSize.getWidth();
  const M = 15;

  drawHeader(doc, {
    title: 'ΔΕΛΤΙΟ',
    subtitle: 'ΠΑΡΑΔΟΣΗΣ',
    orderNumber: detail.order.order_number,
    dnNumber: meta.dnNumber,
    date: meta.date,
  });
  drawCustomerBlock(doc, detail, 49);

  // Lines with prices
  const bodyRows = detail.lines.map((l, i) => {
    const name = prettyScientificName(l.plant_scientific_name) || l.description || '';
    const common = l.plant_common_name?.trim() || '';
    const desc = common && name ? `${common} (${name})` : (common || name);
    const size = cleanSizeSummary(l.size_summary) || '—';
    const discount = l.discount_pct ?? 0;
    const net = l.qty * l.unit_price * (1 - discount / 100);
    return [
      String(i + 1),
      desc,
      size,
      String(l.qty),
      fmtEUR(l.unit_price),
      discount > 0 ? `-${discount.toFixed(0)}%` : '',
      fmtEUR(net),
    ];
  });

  autoTable(doc, {
    startY: 72,
    head: [['Α/Α', 'Περιγραφή', 'Μέγεθος', 'Ποσ.', 'Μον. τιμή', 'Έκπτ.', 'Σύνολο']],
    body: bodyRows,
    margin: { left: M, right: M },
    styles: {
      fontSize: 9.5, font: FONT_FAMILY, cellPadding: 3.5,
      textColor: [30, 30, 30] as [number, number, number],
      lineColor: [210, 210, 210] as [number, number, number],
      lineWidth: { bottom: 0.3, top: 0, left: 0, right: 0 },
    },
    headStyles: {
      fillColor: [245, 245, 245] as [number, number, number],
      textColor: [60, 60, 60] as [number, number, number],
      fontStyle: 'bold', fontSize: 8.5,
      lineWidth: { bottom: 0.5, top: 0, left: 0, right: 0 },
    },
    alternateRowStyles: { fillColor: [252, 252, 252] as [number, number, number] },
    columnStyles: {
      0: { cellWidth: 11, halign: 'center' },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 34 },
      3: { halign: 'center', cellWidth: 14 },
      4: { halign: 'right', cellWidth: 22 },
      5: { halign: 'right', cellWidth: 14 },
      6: { halign: 'right', cellWidth: 22, fontStyle: 'bold' },
    },
    rowPageBreak: 'avoid',
  });

  // @ts-expect-error — lastAutoTable
  const finalY: number = doc.lastAutoTable.finalY;

  // Totals — same logic as the order PDF
  const computed = detail.lines.map((l) => {
    const discount = l.discount_pct ?? 0;
    const net = l.qty * l.unit_price * (1 - discount / 100);
    return { net, vat_rate: coerceVatRate(l.vat_rate) };
  });
  const subtotal = computed.reduce((s, c) => s + c.net, 0);
  const breakdown = vatBreakdown(computed);
  const vatTotal = breakdown.reduce((s, r) => s + r.amount, 0);
  const grandTotal = subtotal + vatTotal;

  let ty = finalY + 10;
  const totalsRight = W - M;
  const totalsLeft = totalsRight - 80;
  const labelX = totalsLeft + 2;
  const valueX = totalsRight - 2;

  setFont(doc, 'normal', 9.5);
  setColor(doc, INK_500);
  doc.text('Υποσύνολο', labelX, ty);
  setColor(doc, INK_900);
  doc.text(fmtEUR(subtotal), valueX, ty, { align: 'right' });
  ty += 5.5;

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
  setDraw(doc, INK_300);
  doc.setLineWidth(0.3);
  doc.line(totalsLeft, ty - 4, totalsRight, ty - 4);

  setFont(doc, 'bold', 10);
  setColor(doc, SAGE_800);
  doc.text('Σύνολο', labelX, ty + 2);
  setFont(doc, 'bold', 16);
  doc.text(fmtEUR(grandTotal), valueX, ty + 2, { align: 'right' });
  ty += 12;

  if (meta.notes && meta.notes.trim()) {
    ty = drawNotesBlock(doc, meta.notes.trim(), ty + 4);
  }
  drawSignatureLines(doc, ty + 20);
}

/* ── Mode 3 — Visual picking list (photos) ────────────────── */

export function appendVisualPickingSection(
  doc: jsPDF,
  detail: OrderDetail,
  photos: Record<string, string>,
) {
  const W = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const M = 12;
  let y = 10;

  // Header row
  setFont(doc, 'bold', 14);
  setColor(doc, [30, 30, 30]);
  doc.text(`Παραγγελία: ${detail.order.order_number}`, M, y + 6);

  const c = detail.customer;
  const name = c?.trading_name || c?.legal_name || '';
  if (name) {
    setFont(doc, 'normal', 11);
    setColor(doc, [80, 80, 80]);
    doc.text(name, M, y + 13);
  }
  y += 20;
  setDraw(doc, [200, 200, 200]);
  doc.line(M, y, W - M, y);
  y += 4;

  const PHOTO_W = 50;
  const PHOTO_H = 50;
  const ROW_H = 58;
  const TEXT_X = M + PHOTO_W + 8;

  for (const line of detail.lines) {
    if (y + ROW_H > pageH - 15) {
      doc.addPage();
      y = 12;
    }

    // Photo or placeholder
    const photoData = photos[line.variant_id] || null;
    if (photoData) {
      try {
        // The endpoint returns base64 JPEG (or PNG) — jsPDF auto-detects
        // from the data prefix; we pass 'JPEG' as a hint.
        doc.addImage(photoData, 'JPEG', M, y, PHOTO_W, PHOTO_H);
      } catch {
        drawPhotoPlaceholder(doc, M, y, PHOTO_W, PHOTO_H);
      }
    } else {
      drawPhotoPlaceholder(doc, M, y, PHOTO_W, PHOTO_H);
    }

    // Plant name — prefer common, fall back to scientific
    const plantName = line.plant_common_name?.trim()
      || prettyScientificName(line.plant_scientific_name)
      || line.description
      || '';
    setFont(doc, 'bold', 14);
    setColor(doc, [30, 30, 30]);
    doc.text(plantName, TEXT_X, y + 8);

    // Optional scientific (when we promoted common — only show Latin as
    // secondary line if common is present too)
    if (line.plant_common_name?.trim() && line.plant_scientific_name) {
      setFont(doc, 'normal', 10);
      setColor(doc, [110, 110, 110]);
      doc.text(prettyScientificName(line.plant_scientific_name), TEXT_X, y + 14);
    }

    // Size info
    const size = cleanSizeSummary(line.size_summary);
    if (size) {
      setFont(doc, 'normal', 11);
      setColor(doc, [60, 60, 60]);
      doc.text(size.toUpperCase(), TEXT_X, y + 22);
    }

    // Qty — big and right-aligned
    setFont(doc, 'bold', 22);
    setColor(doc, [30, 70, 50]);
    doc.text(`${line.qty} τμχ`, W - M, y + 18, { align: 'right' });

    y += ROW_H;
  }
}

function drawPhotoPlaceholder(doc: jsPDF, x: number, y: number, w: number, h: number) {
  setDraw(doc, [200, 200, 200]);
  doc.setFillColor(245, 245, 245);
  doc.roundedRect(x, y, w, h, 2, 2, 'FD');
  setFont(doc, 'normal', 8);
  setColor(doc, [180, 180, 180]);
  doc.text('No photo', x + w / 2, y + h / 2, { align: 'center' });
}

/* ── Top-level entry: pick modes, return single PDF Blob ──── */

export type DeliveryPdfMode = 'slip' | 'priced' | 'visual';

interface BuildOptions {
  modes: DeliveryPdfMode[];
  dnNumber: string;
  notes?: string;
  /** variant_id → base64; required when 'visual' ∈ modes. */
  photos?: Record<string, string>;
}

export async function buildDeliveryPdf(
  detail: OrderDetail,
  opts: BuildOptions,
): Promise<Blob> {
  const doc = new jsPDF('p', 'mm', 'a4');
  await registerFonts(doc);
  doc.setFont(FONT_FAMILY, 'normal');

  const meta: DeliveryDocMeta = {
    dnNumber: opts.dnNumber,
    date: detail.order.delivery_date || new Date().toISOString().slice(0, 10),
    notes: opts.notes ?? detail.order.notes ?? undefined,
  };

  // Render each requested mode, adding a page break between sections.
  let isFirst = true;
  for (const mode of opts.modes) {
    if (!isFirst) doc.addPage();
    isFirst = false;
    if (mode === 'slip') appendDeliverySlipSection(doc, detail, meta);
    else if (mode === 'priced') appendPricedDeliverySection(doc, detail, meta);
    else if (mode === 'visual') appendVisualPickingSection(doc, detail, opts.photos ?? {});
  }

  drawFooter(doc);
  return doc.output('blob');
}

/**
 * Generate + share-or-download a delivery PDF, mirroring the existing
 * shareOrDownloadOrderPdf flow. Filename uses the DN number when known.
 */
export async function shareOrDownloadDeliveryPdf(
  detail: OrderDetail,
  opts: BuildOptions,
): Promise<'shared' | 'downloaded'> {
  const blob = await buildDeliveryPdf(detail, opts);
  const stem = opts.dnNumber || detail.order.order_number || 'delivery';
  const filename = `${stem}.pdf`;
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
        title: `Δελτίο ${stem}`,
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

// Reference unused fmtLongDate — kept exported in case future header
// variants need a Greek-formatted date.
export { fmtLongDate };

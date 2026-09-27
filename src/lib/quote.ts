/**
 * Framework-free quote helpers for the Direct Orders PWA.
 *
 * Quotes are written through bloom-crm's own POST /api/quotes/save — the
 * endpoint the desktop QuoteBuilder uses — so every Bloom rule runs server
 * side. This module only shapes the payloads and derives display state; it
 * never re-implements a Bloom rule except as a client-side pre-check that
 * saves a round trip (e.g. unpriced lines before "Αποστολή").
 */

import type { DraftLine } from './draft-line';
import { coerceVatRate, vatBreakdown, type VatBreakdownRow } from './vat';
import { localDayKey } from './format';
import type {
  PriceScope, Quote, QuoteDetail, QuoteLine, QuoteStatus,
} from '@/types';

export const QUOTE_STATUS_LABEL: Record<QuoteStatus, string> = {
  DRAFT: 'Πρόχειρη',
  SENT: 'Εστάλη',
  ACCEPTED: 'Αποδεκτή',
  REJECTED: 'Απορρίφθηκε',
  EXPIRED: 'Έληξε',
  CONVERTED: 'Παραγγελία',
  SUPERSEDED: 'Αντικαταστάθηκε',
};

/** Statuses a quote can no longer be edited in (bloom-crm quote-lock.mjs). */
export const LOCKED_QUOTE_STATUSES: QuoteStatus[] = ['ACCEPTED', 'CONVERTED'];

/** Default validity in days — same default as the desktop QuoteBuilder. */
export const DEFAULT_VALIDITY_DAYS = 30;

/** Transitions the PWA offers. Revisions / SUPERSEDED stay desktop-only. */
const TRANSITIONS: Partial<Record<QuoteStatus, QuoteStatus[]>> = {
  DRAFT: ['SENT', 'REJECTED'],
  SENT: ['ACCEPTED', 'REJECTED'],
  EXPIRED: ['SENT'],
};

export function canTransition(from: QuoteStatus, to: QuoteStatus): boolean {
  return (TRANSITIONS[from] ?? []).includes(to);
}

/** Main (non-alternative) lines — the ones the customer is quoted. */
export function mainLines<T extends { is_alternative?: boolean }>(lines: readonly T[]): T[] {
  return lines.filter((l) => !l.is_alternative);
}

export function quoteLineNet(l: Pick<QuoteLine, 'qty' | 'unit_sell_price' | 'discount_pct'>): number {
  const discount = Number(l.discount_pct ?? 0) || 0;
  return Number(l.qty) * Number(l.unit_sell_price) * (1 - discount / 100);
}

export interface QuoteTotals {
  subtotal: number;
  breakdown: VatBreakdownRow[];
  vat: number;
  total: number;
}

export function quoteTotals(lines: readonly QuoteLine[]): QuoteTotals {
  const main = mainLines(lines);
  const computed = main.map((l) => ({ net: quoteLineNet(l), vat_rate: coerceVatRate(l.vat_rate) }));
  const subtotal = computed.reduce((s, c) => s + c.net, 0);
  const breakdown = vatBreakdown(computed);
  const vat = breakdown.reduce((s, r) => s + r.amount, 0);
  return { subtotal, breakdown, vat, total: subtotal + vat };
}

/** A SENT or DRAFT quote whose validity has passed. Bloom has no job that
 *  flips these to EXPIRED, so the PWA shows it without changing the status. */
export function isQuoteExpired(quote: Pick<Quote, 'status' | 'valid_until'>, today: string): boolean {
  if (quote.status !== 'SENT' && quote.status !== 'DRAFT') return false;
  const until = localDayKey(quote.valid_until);
  return !!until && until < today;
}

/** Status to render: EXPIRED overlays an open quote past its validity. */
export function displayQuoteStatus(quote: Pick<Quote, 'status' | 'valid_until'>, today: string): QuoteStatus {
  return isQuoteExpired(quote, today) ? 'EXPIRED' : quote.status;
}

/** Unmatched lines have no catalogue variant yet (free-text). The desktop
 *  shows them as "needs matching"; accepting creates order lines without one. */
export function unmatchedLines(lines: readonly QuoteLine[]): QuoteLine[] {
  return mainLines(lines).filter((l) => !l.offered_variant_id);
}

/** Line numbers that Bloom would reject with 422 UNPRICED_LINES on send:
 *  matched to a variant but priced at 0. Mirrors findUnpricedLines(). */
export function unpricedLineNos(lines: readonly Pick<QuoteLine, 'line_no' | 'offered_variant_id' | 'unit_sell_price'>[]): number[] {
  return lines
    .filter((l) => !!l.offered_variant_id && (l.unit_sell_price == null || Number(l.unit_sell_price) === 0))
    .map((l) => l.line_no)
    .sort((a, b) => a - b);
}

export function makeQuoteId(now = Date.now(), rand = Math.random): string {
  return `q-${now}-${rand().toString(36).slice(2, 8)}`;
}

/** Wizard cart line → quote_lines row for POST /api/quotes/save.
 *  Catalogue lines set offered_variant_id. Free-text lines stay UNMATCHED
 *  (offered_variant_id null, name in offered_common_name_override, size in
 *  requested_spec_text) — Bloom's own "needs matching" flow, rather than
 *  creating draft catalogue rows the way direct orders do. */
export function draftLineToQuoteLine(line: DraftLine, quoteId: string, index: number): QuoteLine {
  const base: QuoteLine = {
    id: `ql-${quoteId}-${index + 1}`,
    quote_id: quoteId,
    line_no: index + 1,
    is_alternative: false,
    offered_variant_id: line.draft ? null : line.variant_id,
    qty: line.qty,
    unit_sell_price: line.unit_price,
    discount_pct: 0,
    vat_rate: line.vat_rate,
    description_override: line.description || '',
    supplier_procurement_status: 'READY',
  };
  if (line.draft) {
    base.offered_common_name_override = line.draft.name.trim();
    base.requested_spec_text = line.draft.size.trim();
  }
  return base;
}

export interface NewQuoteInput {
  quoteId: string;
  customerId: string;
  status: 'DRAFT' | 'SENT';
  issueDate: string;
  validUntil: string;
  notes: string;
  terms: string;
  lines: DraftLine[];
}

export interface SaveQuotePayload {
  quote: Partial<Quote> & Pick<Quote, 'id' | 'customer_id' | 'status'>;
  lines: QuoteLine[];
  audit?: { action?: string };
}

/** Payload for creating a quote. quote_number is omitted on purpose: the
 *  server mints it inside the transaction (advisory-locked sequence). */
export function buildNewQuotePayload(input: NewQuoteInput): SaveQuotePayload {
  const now = new Date().toISOString().slice(0, 10);
  return {
    quote: {
      id: input.quoteId,
      customer_id: input.customerId,
      status: input.status,
      currency: 'EUR',
      issue_date: input.issueDate,
      valid_until: input.validUntil,
      notes: input.notes.trim(),
      terms: input.terms.trim(),
      revision_of_quote_id: null,
      revision_no: 0,
      created_at: now,
      updated_at: now,
    },
    lines: input.lines.map((l, i) => draftLineToQuoteLine(l, input.quoteId, i)),
    audit: { action: 'PWA_CREATE_QUOTE' },
  };
}

/** Payload for changing an existing quote (status, notes, validity). ALL
 *  lines go back verbatim — including alternatives and every override
 *  column — because the server replaces quote_lines wholesale on save. */
export function buildQuoteUpdatePayload(
  detail: Pick<QuoteDetail, 'quote' | 'lines'>,
  patch: Partial<Pick<Quote, 'status' | 'notes' | 'valid_until' | 'terms'>>,
  action = 'UPDATE_STATUS',
): SaveQuotePayload {
  const lines = detail.lines.map((l) => {
    const copy = { ...l };
    delete copy.display;
    return copy;
  });
  return {
    quote: { ...detail.quote, ...patch, updated_at: new Date().toISOString().slice(0, 10) },
    lines,
    audit: { action },
  };
}

/** Resolve a 422 GROUP_PRICE_DEVIATIONS by stamping the operator's choice
 *  onto the deviating lines (by line_no) — exactly what the desktop
 *  GroupDeviationDialog sends back. */
export function applyPriceScope(
  payload: SaveQuotePayload,
  lineNos: readonly number[],
  scope: PriceScope,
): SaveQuotePayload {
  const set = new Set(lineNos);
  return {
    ...payload,
    lines: payload.lines.map((l, i) => (set.has(i + 1) ? { ...l, price_scope: scope } : l)),
  };
}

export const PRICE_SCOPE_LABEL: Record<PriceScope, { title: string; sub: string }> = {
  quote: { title: 'Μόνο σε αυτή την προσφορά', sub: 'Η τιμή ομίλου μένει ως έχει' },
  customer: { title: 'Εξαίρεση για τον πελάτη', sub: 'Προσωπική τιμή μόνο για αυτόν' },
  group: { title: 'Νέα τιμή ομίλου', sub: 'Αλλάζει για όλα τα μέλη του ομίλου' },
};

export interface GroupDeviation {
  line_no: number;
  variant_id: string;
  display_name: string;
  group_price: number;
  line_price: number;
}

/** Customer-facing message that accompanies the PDF. */
export function buildQuoteMessage(opts: {
  customerName: string;
  quoteNumber: string;
  total: string;
  validUntil: string;
}): string {
  const name = opts.customerName.trim();
  const greeting = name ? `Γεια σας ${name}` : 'Γεια σας';
  return `${greeting}, σας στέλνουμε την προσφορά ${opts.quoteNumber} συνολικού ποσού ${opts.total} (με ΦΠΑ), με ισχύ έως ${opts.validUntil}. Για οποιαδήποτε απορία είμαστε στη διάθεσή σας. Φυτώρια Πακκούτη`;
}

const TERMS_KEY = 'bdo_last_quote_terms';

export function loadLastTerms(): string {
  try {
    return window.localStorage.getItem(TERMS_KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveLastTerms(terms: string): void {
  try {
    window.localStorage.setItem(TERMS_KEY, terms);
  } catch {
    /* private mode — non-essential */
  }
}

export type QuoteSaveError =
  | { kind: 'group'; deviations: GroupDeviation[]; message: string; memberCount: number }
  | { kind: 'unpriced'; message: string; lineNos: number[] }
  | { kind: 'locked'; message: string }
  | { kind: 'other'; message: string };

/** Classify a failed POST /api/quotes/save (ApiError from apiFetch). */
export function readQuoteSaveError(err: unknown): QuoteSaveError {
  const e = err as { status?: number; payload?: unknown; message?: string } | null;
  const body = (e?.payload && typeof e.payload === 'object' ? e.payload : {}) as Record<string, unknown>;
  const code = String(body.error ?? '');
  const message = String(body.message ?? '') || (e?.message ?? 'Σφάλμα αποθήκευσης');
  if (e?.status === 422 && code === 'GROUP_PRICE_DEVIATIONS') {
    return {
      kind: 'group',
      deviations: Array.isArray(body.deviations) ? (body.deviations as GroupDeviation[]) : [],
      memberCount: Number(body.member_count ?? 0),
      message,
    };
  }
  if (e?.status === 422 && code === 'UNPRICED_LINES') {
    return { kind: 'unpriced', message, lineNos: Array.isArray(body.line_nos) ? (body.line_nos as number[]) : [] };
  }
  if (e?.status === 409) {
    return {
      kind: 'locked',
      message: code === 'QUOTE_LOCKED'
        ? 'Η προσφορά είναι κλειδωμένη. Οι αλλαγές γίνονται πλέον στην παραγγελία.'
        : 'Υπάρχει νεότερη αναθεώρηση της προσφοράς στο Bloom.',
    };
  }
  return { kind: 'other', message };
}

/** QT-YYYY-NNN → [year, n]; unknown formats sort last. */
function quoteNumberKey(n: string): [number, number] {
  const m = /^QT-(\d{4})-(\d+)$/.exec(n || '');
  return m ? [Number(m[1]), Number(m[2])] : [0, 0];
}

/** Newest first by quote number. The list endpoint orders by created_at, a
 *  DATE column, so quotes made on the same day come back in id order. The
 *  QT sequence is minted under a lock, so it is the reliable creation order. */
export function compareQuotesNewestFirst(a: Pick<Quote, 'quote_number'>, b: Pick<Quote, 'quote_number'>): number {
  const [ya, na] = quoteNumberKey(a.quote_number);
  const [yb, nb] = quoteNumberKey(b.quote_number);
  return yb - ya || nb - na;
}

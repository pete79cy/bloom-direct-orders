import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowLeft, Check, Copy, Eye, FileText, Pencil, Plus, Send, ShoppingCart, Trash2, X, CalendarClock, AlertTriangle,
} from 'lucide-react';
import { useCustomerPrices, useQuote } from '@/lib/queries';
import { apiFetchBlob } from '@/lib/api';
import { useQuoteSaver } from '@/hooks/useQuoteSaver';
import { MobileSheet } from '@/components/MobileSheet';
import QuoteStatusBadge from '@/components/QuoteStatusBadge';
import QuoteStatusTimeline from '@/components/QuoteStatusTimeline';
import SendQuoteSheet from '@/components/SendQuoteSheet';
import StatusBadge from '@/components/StatusBadge';
import OrderTotalPresentView, { type PresentLine } from '@/components/OrderTotalPresentView';
import VariantPickerSheet from '@/components/VariantPickerSheet';
import AddLineSheet, { type AddLineResult } from '@/components/AddLineSheet';
import QtyStepper from '@/components/QtyStepper';
import { addDays, fmtEUR, fmtLongDate, fmtShortDate, localDayKey } from '@/lib/format';
import { cleanSizeSummary, prettyScientificName } from '@/lib/plant-display';
import { VAT_LABEL, coerceVatRate } from '@/lib/vat';
import {
  LOCKED_QUOTE_STATUSES, QUOTE_STATUS_LABEL, applyQuoteLineEdits, buildQuoteUpdatePayload, canTransition,
  defaultQuotePdfLanguage, displayQuoteStatus, hasQuoteLineEdits, isQuoteExpired, mainLines, quoteLineNet,
  quotePdfPath, quoteTotals, unmatchedLines,
} from '@/lib/quote';
import type { DraftLine } from '@/lib/draft-line';
import type { DuplicateSeed } from '@/pages/NewOrderWizard';
import type { Plant, Quote, QuoteDetail as QuoteDetailData, QuoteLine, Variant } from '@/types';

type Confirm = null | 'accept' | 'reject';

const HISTORY_ACTION_LABEL: Record<string, string> = {
  CREATE_QUOTE: 'Δημιουργία',
  UPDATE_STATUS: 'Αλλαγή κατάστασης',
  PWA_SEND_SHARE: 'Αποστολή (κοινοποίηση)',
  PWA_SEND_GMAIL: 'Αποστολή (Gmail)',
  SUPERSEDED_BY_REVISION: 'Νέα αναθεώρηση',
};

function todayLocal(): string {
  return localDayKey(new Date().toISOString());
}

export default function QuoteDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { data, isLoading, error } = useQuote(id);
  const saver = useQuoteSaver();

  // Arriving from the wizard's "Αποστολή" CTA opens the send sheet. The
  // sheet only renders once the quote has loaded, so starting open is safe.
  const wantsSend = (location.state as { openSend?: boolean } | null)?.openSend === true;
  const [sendOpen, setSendOpen] = useState(wantsSend);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [extendOpen, setExtendOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [notesEditing, setNotesEditing] = useState(false);
  const [notesDraft, setNotesDraft] = useState('');
  const [presentOpen, setPresentOpen] = useState(false);
  // Inline line edit — same shape as OrderDetail's edit mode, but saved as
  // one POST /api/quotes/save (quote lines are replaced wholesale).
  const [editMode, setEditMode] = useState(false);
  const [editedQty, setEditedQty] = useState<Record<string, number>>({});
  const [editedPrice, setEditedPrice] = useState<Record<string, number>>({});
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  const [addedLines, setAddedLines] = useState<Array<DraftLine & { label: string }>>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [picked, setPicked] = useState<{ variant: Variant; plant: Plant | undefined } | null>(null);
  const { data: customerPrices = [] } = useCustomerPrices(editMode ? data?.customer?.id : undefined);

  // Clear the flag so a reload or back-navigation doesn't reopen the sheet.
  useEffect(() => {
    if (wantsSend) navigate(location.pathname, { replace: true, state: {} });
  }, [wantsSend, navigate, location.pathname]);

  if (isLoading) return <p className="p-6 text-ink-500 text-sm">Φόρτωση…</p>;
  if (error || !data) {
    return (
      <div className="p-6">
        <p className="text-sm" style={{ color: 'var(--clay)' }}>Η προσφορά δεν βρέθηκε.</p>
        <Link to="/quotes" style={{ color: 'var(--sage-700)', fontSize: 14 }}>← Προσφορές</Link>
      </div>
    );
  }

  const detail: QuoteDetailData = data;
  const { quote, customer, linkedOrder, statusHistory, isLatestRevision } = detail;
  const today = todayLocal();
  const shown = displayQuoteStatus(quote, today);
  const expired = isQuoteExpired(quote, today);
  const locked = LOCKED_QUOTE_STATUSES.includes(quote.status) || !isLatestRevision;
  const editable = !locked && quote.status !== 'SUPERSEDED';
  const lines = mainLines(detail.lines);
  const unmatched = unmatchedLines(detail.lines);
  const edits = { qty: editedQty, price: editedPrice, removed: removedIds, added: addedLines };
  // While editing, totals preview what is about to be saved.
  const totals = quoteTotals(editMode ? applyQuoteLineEdits(quote.id, detail.lines, edits) : detail.lines);
  const dirty = editMode && hasQuoteLineEdits(detail.lines, edits);
  const canEditLines = editable && !linkedOrder && quote.status !== 'REJECTED';
  const customerName = customer?.trading_name || customer?.legal_name || 'Άγνωστος πελάτης';

  async function change(
    patch: Partial<Pick<Quote, 'status' | 'notes' | 'valid_until'>>,
    action: string,
  ) {
    setBusy(true);
    try {
      return await saver.save(buildQuoteUpdatePayload(detail, patch, action));
    } finally {
      setBusy(false);
    }
  }

  /** Move to SENT through Bloom before anything leaves the phone. */
  async function ensureSent(action: string): Promise<boolean> {
    if (quote.status === 'SENT') return true;
    if (!canTransition(quote.status, 'SENT')) {
      toast.error(`Δεν γίνεται αποστολή από «${QUOTE_STATUS_LABEL[quote.status]}».`);
      return false;
    }
    const res = await change({ status: 'SENT' }, action);
    return !!res;
  }

  async function onAccept() {
    setConfirm(null);
    const res = await change({ status: 'ACCEPTED' }, 'UPDATE_STATUS');
    if (!res) return;
    if (res.orderNumber && res.orderId) {
      const orderId = res.orderId;
      toast.success(`Δημιουργήθηκε παραγγελία ${res.orderNumber}`, {
        action: { label: 'Άνοιγμα', onClick: () => navigate(`/orders/${orderId}`) },
      });
    } else {
      toast.success('Η προσφορά έγινε αποδεκτή');
    }
  }

  async function onReject() {
    setConfirm(null);
    const res = await change({ status: 'REJECTED' }, 'UPDATE_STATUS');
    if (res) toast.success('Η προσφορά σημειώθηκε ως απορριφθείσα');
  }

  async function onExtend(days: number) {
    setExtendOpen(false);
    const base = expired ? today : localDayKey(quote.valid_until) || today;
    const next = addDays(base, days);
    const res = await change({ valid_until: next }, 'PWA_EXTEND_VALIDITY');
    if (res) toast.success(`Ισχύει έως ${fmtLongDate(next)}`);
  }

  async function onSaveNotes() {
    const res = await change({ notes: notesDraft.trim() }, 'PWA_EDIT_NOTES');
    if (res) {
      setNotesEditing(false);
      toast.success('Οι σημειώσεις αποθηκεύτηκαν');
    }
  }

  function resetEdits() {
    setEditedQty({});
    setEditedPrice({});
    setRemovedIds(new Set());
    setAddedLines([]);
    setPicked(null);
    setPickerOpen(false);
    setEditMode(false);
  }

  function onAddLine(result: AddLineResult) {
    if (!picked) return;
    const { variant, plant } = picked;
    setAddedLines((prev) => [...prev, {
      variant_id: variant.id,
      qty: result.qty,
      unit_price: result.unit_price,
      price_source: result.priceOverridden ? 'override' : 'default',
      vat_rate: result.vat_rate,
      description: result.description,
      label: plant?.common_name?.trim() || prettyScientificName(plant?.scientific_name ?? null) || variant.id,
    }]);
    setPicked(null);
  }

  async function onSaveLines() {
    if (!dirty) {
      resetEdits();
      return;
    }
    setBusy(true);
    try {
      const payload = buildQuoteUpdatePayload(detail, {}, 'PWA_EDIT_LINES');
      const res = await saver.save({ ...payload, lines: applyQuoteLineEdits(quote.id, detail.lines, edits) });
      if (res) {
        resetEdits();
        toast.success('Οι αλλαγές αποθηκεύτηκαν');
      }
    } finally {
      setBusy(false);
    }
  }

  const presentLines: PresentLine[] = lines.map((l) => {
    const d = l.display;
    return {
      id: l.id,
      description: d?.plant_common_name || d?.free_text || prettyScientificName(d?.plant_scientific_name ?? null) || 'Φυτό',
      qty: Number(l.qty),
      unitPrice: Number(l.unit_sell_price),
      lineTotal: quoteLineNet(l),
    };
  });

  async function onPdf() {
    setPdfBusy(true);
    try {
      // Bloom's own PDF (desktop generator, rendered by bloom-crm).
      const [blob, { shareOrDownloadPdf }] = await Promise.all([
        apiFetchBlob(quotePdfPath(quote.id, defaultQuotePdfLanguage(customer?.language))),
        import('@/lib/pdf-sales-doc'),
      ]);
      await shareOrDownloadPdf(blob, `${quote.quote_number}.pdf`, `Προσφορά ${quote.quote_number}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Αποτυχία δημιουργίας PDF');
    } finally {
      setPdfBusy(false);
    }
  }

  function onDuplicate() {
    const seed: DuplicateSeed = {
      customer: customer ?? null,
      lines: lines.map((l) => ({
        variant_id: l.offered_variant_id ?? '',
        qty: Number(l.qty),
        unit_price: Number(l.unit_sell_price),
        vat_rate: Number(l.vat_rate) || 19,
        description: l.offered_variant_id ? (l.description_override || '') : '',
        ...(l.offered_variant_id
          ? {}
          : {
            draft: {
              name: l.display?.plant_common_name || l.display?.free_text || 'Φυτό',
              size: String(l.requested_spec_text ?? ''),
            },
          }),
      })),
      fromQuoteNumber: quote.quote_number,
    };
    navigate('/quotes/new', { state: { duplicate: seed } });
  }

  // Primary CTA by status — mirrors the desktop mobile quote detail.
  let primary: { label: string; icon: ReactNode; onClick: () => void; disabled?: boolean } | null = null;
  if (linkedOrder) {
    primary = { label: `Άνοιγμα ${linkedOrder.order_number}`, icon: <ShoppingCart size={18} />, onClick: () => navigate(`/orders/${linkedOrder.id}`) };
  } else if (!isLatestRevision || quote.status === 'SUPERSEDED' || quote.status === 'REJECTED') {
    primary = { label: 'Αντίγραφο ως νέα', icon: <Copy size={18} />, onClick: onDuplicate };
  } else if (quote.status === 'DRAFT' || quote.status === 'EXPIRED') {
    primary = { label: 'Αποστολή', icon: <Send size={18} />, onClick: () => setSendOpen(true) };
  } else if (quote.status === 'SENT') {
    primary = { label: 'Αποδοχή πελάτη', icon: <Check size={18} />, onClick: () => setConfirm('accept') };
  }

  return (
    <div className="min-h-screen" style={{ paddingBottom: 120 }}>
      <header className="pt-safe" style={{ padding: '14px 20px 8px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="Πίσω"
          className="ios-tap"
          style={{ width: 36, height: 36, marginLeft: -8, borderRadius: 999, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-700)' }}
        >
          <ArrowLeft size={18} />
        </button>
        <h1 className="font-mono-meta" style={{ fontSize: 17, fontWeight: 500, flex: 1 }}>{quote.quote_number}</h1>
        <QuoteStatusBadge status={shown} hasOrder={!!linkedOrder} />
      </header>

      <div style={{ padding: '4px 20px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {!isLatestRevision && (
          <Banner tone="info">Υπάρχει νεότερη αναθεώρηση στο Bloom. Αυτή η έκδοση είναι μόνο για ανάγνωση.</Banner>
        )}
        {expired && isLatestRevision && (
          <Banner tone="warn" action={editable ? { label: 'Παράταση', onClick: () => setExtendOpen(true) } : undefined}>
            Η ισχύς έληξε στις {fmtLongDate(quote.valid_until)}.
          </Banner>
        )}

        {/* Hero */}
        <div style={{ background: '#fff', borderRadius: 16, boxShadow: 'var(--shadow-card)', padding: '16px 16px 14px' }}>
          <p className="font-display" style={{ fontSize: 21, fontWeight: 500, lineHeight: 1.15 }}>{customerName}</p>
          <p className="font-mono-meta" style={{ fontSize: 11, color: 'var(--ink-500)', marginTop: 4 }}>
            Έκδοση {fmtShortDate(quote.issue_date)} · ισχύει έως {fmtShortDate(quote.valid_until)} · {lines.length} γραμμές
          </p>
          <div style={{ marginTop: 16 }}>
            <QuoteStatusTimeline status={shown} hasOrder={!!linkedOrder} />
          </div>
        </div>

        {/* Linked order (created by Bloom on acceptance) */}
        {linkedOrder && (
          <Link
            to={`/orders/${linkedOrder.id}`}
            style={{ background: '#fff', borderRadius: 16, boxShadow: 'var(--shadow-card)', padding: '14px 16px', borderLeft: '3px solid var(--sage-700)', display: 'block' }}
          >
            <div className="folio" style={{ marginBottom: 6 }}><span>Συνδεδεμένη παραγγελία</span></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <p className="font-mono-meta" style={{ fontSize: 15, fontWeight: 500 }}>{linkedOrder.order_number}</p>
                <p style={{ fontSize: 12, color: 'var(--ink-500)', marginTop: 2 }}>Δημιουργήθηκε από αυτή την προσφορά</p>
              </div>
              <StatusBadge status={linkedOrder.status} />
            </div>
          </Link>
        )}

        {unmatched.length > 0 && !linkedOrder && (
          <Banner tone="warn">
            {unmatched.length === 1 ? 'Μία γραμμή δεν έχει' : `${unmatched.length} γραμμές δεν έχουν`} αντιστοιχιστεί
            σε φυτό του καταλόγου. Η αντιστοίχιση γίνεται από το Bloom, και μέχρι τότε δεν βγαίνει PDF.
          </Banner>
        )}

        {/* Present mode — full-screen total for showing the customer, as on orders. */}
        {!editMode && (
          <button
            type="button"
            onClick={() => setPresentOpen(true)}
            className="ios-tap"
            aria-label="Προβολή συνόλου"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              height: 48, borderRadius: 14, border: 0, cursor: 'pointer',
              background: 'var(--sage-700)', color: 'var(--cream-50)', fontSize: 15, fontWeight: 600,
            }}
          >
            <Eye size={18} strokeWidth={2} />
            Προβολή συνόλου
          </button>
        )}

        {/* Lines */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div className="folio"><span>Γραμμές</span></div>
          {canEditLines && !editMode && (
            <button
              type="button"
              onClick={() => setEditMode(true)}
              className="ios-tap"
              aria-label="Επεξεργασία γραμμών"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 12px',
                borderRadius: 999, border: 0, background: 'var(--sage-100, #E6EEE2)', color: 'var(--sage-800)',
                fontSize: 13, fontWeight: 600,
              }}
            >
              <Pencil size={13} strokeWidth={2.2} />
              Επεξεργασία
            </button>
          )}
          {editMode && (
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                onClick={resetEdits}
                disabled={busy}
                className="ios-tap"
                aria-label="Ακύρωση επεξεργασίας"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4, height: 32, padding: '0 12px',
                  borderRadius: 999, border: '1px solid rgba(63,75,70,0.18)', background: '#fff',
                  color: 'var(--ink-700)', fontSize: 13, fontWeight: 600,
                }}
              >
                <X size={14} strokeWidth={2.2} />
                Ακύρωση
              </button>
              <button
                type="button"
                onClick={() => void onSaveLines()}
                disabled={!dirty || busy}
                className="ios-tap"
                aria-label="Αποθήκευση αλλαγών"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4, height: 32, padding: '0 14px',
                  borderRadius: 999, border: 0, fontSize: 13, fontWeight: 600,
                  background: dirty && !busy ? 'var(--sage-700)' : 'var(--cream-200)',
                  color: dirty && !busy ? 'var(--cream-50)' : 'var(--ink-500)',
                }}
              >
                <Check size={14} strokeWidth={2.4} />
                {busy ? 'Αποθήκευση…' : 'Αποθήκευση'}
              </button>
            </div>
          )}
        </div>
        <div style={{ background: '#fff', borderRadius: 16, boxShadow: 'var(--shadow-card)', overflow: 'hidden' }}>
          {lines.map((l, i) => (
            <LineRow
              key={l.id}
              line={l}
              first={i === 0}
              edit={editMode ? {
                qty: editedQty[l.id] ?? Number(l.qty),
                price: editedPrice[l.id] ?? Number(l.unit_sell_price),
                removed: removedIds.has(l.id),
                onQty: (n) => setEditedQty((m) => ({ ...m, [l.id]: n })),
                onPrice: (n) => setEditedPrice((m) => ({ ...m, [l.id]: n })),
                onToggleRemove: () => setRemovedIds((set) => {
                  const next = new Set(set);
                  if (next.has(l.id)) next.delete(l.id);
                  else next.add(l.id);
                  return next;
                }),
              } : undefined}
            />
          ))}
          {addedLines.map((a, i) => (
            <div key={`${a.variant_id}-${i}`}>
              {(lines.length > 0 || i > 0) && <div className="hairline" style={{ margin: '0 16px' }} />}
              <div style={{ padding: '12px 16px', display: 'flex', gap: 10, alignItems: 'flex-start', background: 'var(--sage-50, #F4F7F3)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink-900)' }}>{a.label}</p>
                  <p className="text-eyebrow" style={{ fontSize: 9, marginTop: 2, color: 'var(--sage-700)', letterSpacing: '0.15em' }}>ΝΕΑ</p>
                  <p className="font-mono-meta" style={{ fontSize: 10, color: 'var(--ink-300)', marginTop: 3 }}>
                    {a.qty} × {fmtEUR(a.unit_price)} · {VAT_LABEL[a.vat_rate]}
                  </p>
                </div>
                <span className="font-mono-meta" style={{ fontSize: 13, fontWeight: 500, marginTop: 1 }}>{fmtEUR(a.qty * a.unit_price)}</span>
                <button
                  type="button"
                  onClick={() => setAddedLines((prev) => prev.filter((_, j) => j !== i))}
                  aria-label="Αφαίρεση νέας γραμμής"
                  style={{ width: 28, height: 28, color: 'var(--clay)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
        {editMode && (
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="ios-tap"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 46,
              borderRadius: 14, border: '1.5px dashed rgba(47,79,68,0.30)', background: 'transparent',
              color: 'var(--sage-800)', fontSize: 14, fontWeight: 600,
            }}
          >
            <Plus size={16} strokeWidth={2.2} />
            Νέα γραμμή
          </button>
        )}

        {/* Totals */}
        <div style={{ background: '#fff', borderRadius: 16, boxShadow: 'var(--shadow-card)', padding: 16 }}>
          <div className="folio" style={{ marginBottom: 10 }}><span>Τιμολόγηση</span></div>
          <TotRow label="Υποσύνολο" value={fmtEUR(totals.subtotal)} />
          {totals.breakdown.map((r) => (
            <TotRow key={r.rate} label={VAT_LABEL[r.rate]} sub={`επί ${fmtEUR(r.net)}`} value={fmtEUR(r.amount)} />
          ))}
          <div className="hairline" style={{ margin: '10px 0 8px' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--sage-800)' }}>Σύνολο</span>
            <span className="font-mono-meta" style={{ fontSize: 18, fontWeight: 500, color: 'var(--sage-800)' }}>{fmtEUR(totals.total)}</span>
          </div>
        </div>

        {/* Notes */}
        <div style={{ borderRadius: 14, padding: 14, background: 'var(--cream-200)' }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
            <span className="text-eyebrow" style={{ flex: 1 }}>Σημειώσεις</span>
            {editable && !notesEditing && (
              <button
                type="button"
                aria-label="Επεξεργασία σημειώσεων"
                onClick={() => { setNotesDraft(quote.notes || ''); setNotesEditing(true); }}
                style={{ color: 'var(--sage-700)', padding: 4 }}
              >
                <Pencil size={15} />
              </button>
            )}
          </div>
          {notesEditing ? (
            <>
              <textarea
                id="quote-notes-edit"
                value={notesDraft}
                onChange={(e) => setNotesDraft(e.target.value)}
                rows={3}
                style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid rgba(63,75,70,0.18)', fontSize: 15, background: '#fff' }}
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button type="button" className="btn-secondary" style={{ height: 40 }} onClick={() => setNotesEditing(false)}>Άκυρο</button>
                <button type="button" className="btn-primary" style={{ height: 40 }} disabled={busy} onClick={() => void onSaveNotes()}>
                  {busy ? 'Αποθήκευση…' : 'Αποθήκευση'}
                </button>
              </div>
            </>
          ) : (
            <p style={{ fontSize: 13, color: quote.notes ? 'var(--ink-700)' : 'var(--ink-300)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
              {quote.notes || 'Καμία σημείωση'}
            </p>
          )}
        </div>

        {quote.terms?.trim() && (
          <div style={{ borderRadius: 14, padding: 14, background: 'var(--cream-200)' }}>
            <div className="text-eyebrow" style={{ marginBottom: 6 }}>Όροι</div>
            <p style={{ fontSize: 13, color: 'var(--ink-700)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{quote.terms}</p>
          </div>
        )}

        {/* Secondary actions */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <ActionButton icon={<FileText size={16} />} label={pdfBusy ? 'PDF…' : 'PDF'} onClick={() => void onPdf()} disabled={pdfBusy || unmatched.length > 0} />
          {quote.status === 'SENT' && isLatestRevision && (
            <ActionButton icon={<Send size={16} />} label="Ξαναστείλε" onClick={() => setSendOpen(true)} />
          )}
          {editable && (quote.status === 'DRAFT' || quote.status === 'SENT') && (
            <ActionButton icon={<CalendarClock size={16} />} label="Παράταση ισχύος" onClick={() => setExtendOpen(true)} />
          )}
          {editable && canTransition(quote.status, 'REJECTED') && (
            <ActionButton icon={<X size={16} />} label="Απόρριψη" tone="danger" onClick={() => setConfirm('reject')} />
          )}
          {primary?.label !== 'Αντίγραφο ως νέα' && (
            <ActionButton icon={<Copy size={16} />} label="Αντίγραφο ως νέα" onClick={onDuplicate} />
          )}
        </div>

        {/* History */}
        {statusHistory.length > 0 && (
          <div style={{ borderRadius: 14, padding: 14, background: '#fff', boxShadow: 'var(--shadow-card)' }}>
            <div className="folio" style={{ marginBottom: 8 }}><span>Ιστορικό</span></div>
            {statusHistory.map((h) => (
              <div key={h.id} style={{ display: 'flex', gap: 10, fontSize: 12, padding: '4px 0' }}>
                <span className="font-mono-meta" style={{ color: 'var(--ink-500)', minWidth: 92 }}>
                  {new Date(h.changed_at).toLocaleString('el-GR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </span>
                <span style={{ flex: 1, color: 'var(--ink-700)' }}>
                  {QUOTE_STATUS_LABEL[h.to_status] ?? h.to_status}
                  <span style={{ color: 'var(--ink-500)' }}>
                    {' · '}{HISTORY_ACTION_LABEL[h.action] ?? (h.action.startsWith('GMAIL_DRAFT') ? 'Gmail' : h.action)}
                    {h.changed_by ? ` · ${h.changed_by}` : ''}
                  </span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {primary && !editMode && (
        <div
          className="fixed bottom-0 inset-x-0 pb-safe"
          style={{ background: '#fff', borderTop: '1px solid rgba(63,75,70,0.10)', padding: '14px 20px 16px', zIndex: 30 }}
        >
          <button type="button" className="btn-primary ios-tap" disabled={busy || primary.disabled} onClick={primary.onClick}>
            {primary.icon}
            {busy ? 'Αποθήκευση…' : primary.label}
          </button>
        </div>
      )}

      <SendQuoteSheet open={sendOpen} onClose={() => setSendOpen(false)} detail={detail} ensureSent={ensureSent} />

      <MobileSheet open={confirm === 'accept'} onClose={() => setConfirm(null)} title="Αποδοχή προσφοράς">
        <ConfirmBody
          lines={[
            `Η ${quote.quote_number} θα γίνει «Αποδεκτή» και θα κλειδώσει.`,
            'Το Bloom θα δημιουργήσει αυτόματα την παραγγελία με τις ίδιες γραμμές και τιμές.',
          ]}
          warning={unmatched.length > 0
            ? `${unmatched.length === 1 ? 'Μία γραμμή δεν έχει' : `${unmatched.length} γραμμές δεν έχουν`} αντιστοίχιση σε φυτό. Θα περάσουν στην παραγγελία μόνο με την περιγραφή τους.`
            : null}
          confirmLabel={`Αποδοχή · ${fmtEUR(totals.total)}`}
          onConfirm={() => void onAccept()}
          busy={busy}
        />
      </MobileSheet>

      <MobileSheet open={confirm === 'reject'} onClose={() => setConfirm(null)} title="Απόρριψη προσφοράς">
        <ConfirmBody
          lines={[`Η ${quote.quote_number} θα σημειωθεί ως «Απορρίφθηκε» στο Bloom.`]}
          confirmLabel="Απόρριψη"
          danger
          onConfirm={() => void onReject()}
          busy={busy}
        />
      </MobileSheet>

      <MobileSheet open={extendOpen} onClose={() => setExtendOpen(false)} title="Παράταση ισχύος">
        <div style={{ padding: '4px 16px max(env(safe-area-inset-bottom, 0px), 16px)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ fontSize: 13, color: 'var(--ink-500)', margin: 0 }}>
            Τώρα ισχύει έως {fmtLongDate(quote.valid_until)}. Η παράταση μετράει από {expired ? 'σήμερα' : 'τη λήξη'}.
          </p>
          {[15, 30, 60].map((d) => (
            <button key={d} type="button" className="btn-secondary ios-tap" disabled={busy} onClick={() => void onExtend(d)}>
              +{d} ημέρες · έως {fmtShortDate(addDays(expired ? today : localDayKey(quote.valid_until) || today, d))}
            </button>
          ))}
        </div>
      </MobileSheet>

      <OrderTotalPresentView
        open={presentOpen}
        onClose={() => setPresentOpen(false)}
        orderNumber={quote.quote_number}
        customerName={customerName}
        lines={presentLines}
        subtotal={totals.subtotal}
        vatBreakdown={totals.breakdown}
        grandTotal={totals.total}
        formatEur={fmtEUR}
      />

      <VariantPickerSheet
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        excludeVariantIds={[
          ...lines.filter((l) => !removedIds.has(l.id) && l.offered_variant_id).map((l) => l.offered_variant_id as string),
          ...addedLines.map((a) => a.variant_id),
        ]}
        onPick={(variant, plant) => {
          setPickerOpen(false);
          setPicked({ variant, plant });
        }}
      />
      <AddLineSheet
        addLabel="Προσθήκη στην προσφορά"
        open={picked !== null}
        variant={picked?.variant ?? null}
        plant={picked?.plant}
        customerPrice={picked ? customerPrices.find((cp) => cp.variant_id === picked.variant.id)?.effective_unit_price : null}
        onClose={() => setPicked(null)}
        onAdd={onAddLine}
      />

      {saver.sheet}
    </div>
  );
}

interface LineEdit {
  qty: number;
  price: number;
  removed: boolean;
  onQty: (n: number) => void;
  onPrice: (n: number) => void;
  onToggleRemove: () => void;
}

function LineRow({ line, first, edit }: { line: QuoteLine; first: boolean; edit?: LineEdit }) {
  const d = line.display;
  const name = d?.plant_common_name || d?.free_text || prettyScientificName(d?.plant_scientific_name ?? null) || 'Φυτό';
  const sci = d?.plant_common_name ? prettyScientificName(d?.plant_scientific_name ?? null) : '';
  const size = cleanSizeSummary(d?.size_summary ?? null);
  const discount = Number(line.discount_pct) || 0;
  return (
    <div>
      {!first && <div className="hairline" style={{ margin: '0 16px' }} />}
      <div style={{ padding: '12px 16px', display: 'flex', gap: 10, alignItems: 'flex-start', opacity: edit?.removed ? 0.45 : 1 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink-900)', textDecoration: edit?.removed ? 'line-through' : 'none' }}>
            {name}
            {!line.offered_variant_id && (
              <span className="status-pill status-q-expired" style={{ marginLeft: 6, height: 18, fontSize: 9.5 }}>χωρίς αντιστοίχιση</span>
            )}
            {d?.variant_status === 'draft' && (
              <span className="status-pill status-q-expired" style={{ marginLeft: 6, height: 18, fontSize: 9.5 }}>ΠΡΟΧΕΙΡΟ</span>
            )}
          </p>
          {sci && (
            <p className="font-display" style={{ fontStyle: 'italic', fontSize: 12, color: 'var(--ink-500)', marginTop: 1 }}>{sci}</p>
          )}
          {(size || (line.offered_variant_id && line.description_override)) && (
            <p className="font-mono-meta" style={{ fontSize: 10, color: 'var(--ink-500)', marginTop: 3, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              {[size, line.offered_variant_id ? line.description_override : null].filter(Boolean).join(' · ')}
            </p>
          )}
          {edit ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
              <div style={{ pointerEvents: edit.removed ? 'none' : 'auto' }}>
                <QtyStepper value={edit.qty} onChange={edit.onQty} min={1} />
              </div>
              <label
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', height: 32,
                  borderRadius: 8, border: '1px solid rgba(63,75,70,0.18)', background: edit.removed ? 'var(--cream-200)' : '#fff',
                }}
              >
                <span style={{ fontSize: 13, color: 'var(--ink-500)' }}>€</span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  aria-label="Τιμή"
                  value={edit.price}
                  disabled={edit.removed}
                  onChange={(e) => {
                    const n = Number.parseFloat(e.target.value);
                    if (!Number.isNaN(n) && n >= 0) edit.onPrice(n);
                    else if (e.target.value === '') edit.onPrice(0);
                  }}
                  className="font-mono-meta"
                  style={{ width: 64, border: 0, outline: 'none', background: 'transparent', fontSize: 14, fontWeight: 600, color: 'var(--ink-900)' }}
                />
              </label>
              <button
                type="button"
                onClick={edit.onToggleRemove}
                className="ios-tap"
                aria-label={edit.removed ? 'Επαναφορά γραμμής' : 'Αφαίρεση γραμμής'}
                style={{
                  width: 32, height: 32, borderRadius: 8, border: '1px solid rgba(63,75,70,0.18)',
                  background: edit.removed ? 'var(--clay, #B85C38)' : '#fff',
                  color: edit.removed ? '#fff' : 'var(--clay, #B85C38)',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ) : (
            <p className="font-mono-meta" style={{ fontSize: 10, color: 'var(--ink-300)', marginTop: 3 }}>
              {line.qty} × {fmtEUR(Number(line.unit_sell_price))}
              {discount > 0 ? ` · −${discount}%` : ''} · {VAT_LABEL[coerceVatRate(Number(line.vat_rate))]}
            </p>
          )}
        </div>
        <span className="font-mono-meta" style={{ fontSize: 13, fontWeight: 500, marginTop: 1, textDecoration: edit?.removed ? 'line-through' : 'none' }}>
          {fmtEUR(edit ? quoteLineNet({ ...line, qty: edit.qty, unit_sell_price: edit.price }) : quoteLineNet(line))}
        </span>
      </div>
    </div>
  );
}

function TotRow({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
      <span style={{ fontSize: 13, color: 'var(--ink-500)' }}>
        {label}
        {sub && <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--ink-300)' }}>{sub}</span>}
      </span>
      <span className="font-mono-meta" style={{ fontSize: 13, color: 'var(--ink-700)' }}>{value}</span>
    </div>
  );
}

function ActionButton({
  icon, label, onClick, disabled, tone,
}: { icon: ReactNode; label: string; onClick: () => void; disabled?: boolean; tone?: 'danger' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="ios-tap"
      style={{
        height: 44, borderRadius: 12, background: '#fff', fontSize: 14, fontWeight: 500,
        border: `1px solid ${tone === 'danger' ? 'rgba(179,85,61,0.3)' : 'rgba(63,75,70,0.14)'}`,
        color: tone === 'danger' ? 'var(--clay)' : 'var(--sage-800)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {icon}
      {label}
    </button>
  );
}

function Banner({
  children, tone, action,
}: { children: ReactNode; tone: 'warn' | 'info'; action?: { label: string; onClick: () => void } }) {
  const warn = tone === 'warn';
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 12, fontSize: 13, lineHeight: 1.4,
        background: warn ? 'rgba(198,142,59,0.12)' : 'var(--sage-100)',
        color: warn ? '#7a5621' : 'var(--sage-800)',
      }}
    >
      <AlertTriangle size={16} style={{ flexShrink: 0 }} />
      <span style={{ flex: 1 }}>{children}</span>
      {action && (
        <button type="button" onClick={action.onClick} style={{ fontWeight: 600, color: 'inherit', textDecoration: 'underline' }}>
          {action.label}
        </button>
      )}
    </div>
  );
}

function ConfirmBody({
  lines, warning, confirmLabel, onConfirm, busy, danger,
}: {
  lines: string[];
  warning?: string | null;
  confirmLabel: string;
  onConfirm: () => void;
  busy: boolean;
  danger?: boolean;
}) {
  return (
    <div style={{ padding: '4px 16px max(env(safe-area-inset-bottom, 0px), 16px)', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {lines.map((t) => (
        <p key={t} style={{ fontSize: 14, color: 'var(--ink-700)', lineHeight: 1.45, margin: 0 }}>{t}</p>
      ))}
      {warning && <Banner tone="warn">{warning}</Banner>}
      <button
        type="button"
        className="btn-primary ios-tap"
        disabled={busy}
        onClick={onConfirm}
        style={danger ? { background: 'var(--clay)', boxShadow: 'none' } : undefined}
      >
        {busy ? 'Αποθήκευση…' : confirmLabel}
      </button>
    </div>
  );
}

import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowLeft, Check, Copy, FileText, Pencil, Send, ShoppingCart, X, CalendarClock, AlertTriangle,
} from 'lucide-react';
import { useQuote } from '@/lib/queries';
import { useQuoteSaver } from '@/hooks/useQuoteSaver';
import { MobileSheet } from '@/components/MobileSheet';
import QuoteStatusBadge from '@/components/QuoteStatusBadge';
import QuoteStatusTimeline from '@/components/QuoteStatusTimeline';
import SendQuoteSheet from '@/components/SendQuoteSheet';
import StatusBadge from '@/components/StatusBadge';
import { addDays, fmtEUR, fmtLongDate, fmtShortDate, localDayKey } from '@/lib/format';
import { cleanSizeSummary, prettyScientificName } from '@/lib/plant-display';
import { VAT_LABEL, coerceVatRate } from '@/lib/vat';
import {
  LOCKED_QUOTE_STATUSES, QUOTE_STATUS_LABEL, buildQuoteUpdatePayload, canTransition,
  displayQuoteStatus, isQuoteExpired, mainLines, quoteLineNet, quoteTotals, unmatchedLines,
} from '@/lib/quote';
import type { DuplicateSeed } from '@/pages/NewOrderWizard';
import type { Quote, QuoteDetail as QuoteDetailData, QuoteLine } from '@/types';

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
  const totals = quoteTotals(detail.lines);
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

  async function onPdf() {
    setPdfBusy(true);
    try {
      const [{ generateQuotePdf }, { shareOrDownloadPdf }] = await Promise.all([
        import('@/lib/pdf-quote'),
        import('@/lib/pdf-sales-doc'),
      ]);
      const blob = await generateQuotePdf(detail);
      await shareOrDownloadPdf(blob, `${quote.quote_number}.pdf`, `Προσφορά ${quote.quote_number}`);
    } catch {
      toast.error('Αποτυχία δημιουργίας PDF');
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
            σε φυτό του καταλόγου. Η αντιστοίχιση γίνεται από το Bloom.
          </Banner>
        )}

        {/* Lines */}
        <div style={{ background: '#fff', borderRadius: 16, boxShadow: 'var(--shadow-card)', overflow: 'hidden' }}>
          {lines.map((l, i) => <LineRow key={l.id} line={l} first={i === 0} />)}
        </div>

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
          <ActionButton icon={<FileText size={16} />} label={pdfBusy ? 'PDF…' : 'PDF'} onClick={() => void onPdf()} disabled={pdfBusy} />
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

      {primary && (
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

      {saver.sheet}
    </div>
  );
}

function LineRow({ line, first }: { line: QuoteLine; first: boolean }) {
  const d = line.display;
  const name = d?.plant_common_name || d?.free_text || prettyScientificName(d?.plant_scientific_name ?? null) || 'Φυτό';
  const sci = d?.plant_common_name ? prettyScientificName(d?.plant_scientific_name ?? null) : '';
  const size = cleanSizeSummary(d?.size_summary ?? null);
  const discount = Number(line.discount_pct) || 0;
  return (
    <div>
      {!first && <div className="hairline" style={{ margin: '0 16px' }} />}
      <div style={{ padding: '12px 16px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink-900)' }}>
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
          <p className="font-mono-meta" style={{ fontSize: 10, color: 'var(--ink-300)', marginTop: 3 }}>
            {line.qty} × {fmtEUR(Number(line.unit_sell_price))}
            {discount > 0 ? ` · −${discount}%` : ''} · {VAT_LABEL[coerceVatRate(Number(line.vat_rate))]}
          </p>
        </div>
        <span className="font-mono-meta" style={{ fontSize: 13, fontWeight: 500, marginTop: 1 }}>{fmtEUR(quoteLineNet(line))}</span>
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

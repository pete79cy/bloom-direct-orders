import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText, Repeat } from 'lucide-react';
import { toast } from 'sonner';
import { useOrder, usePatchOrder } from '@/lib/queries';
import { fmtEUR, fmtLongDate } from '@/lib/format';
import StatusTimeline from '@/components/StatusTimeline';
import PdfActionSheet from '@/components/PdfActionSheet';
import { prettyScientificName, cleanSizeSummary } from '@/lib/plant-display';
import { vatBreakdown, VAT_LABEL } from '@/lib/vat';
import { apiFetch } from '@/lib/api';
import type { DeliveryPdfMode } from '@/lib/pdf-delivery';
import type { OrderStatus, OrderLineEnriched, OrderDetail as OrderDetailT } from '@/types';

const STATUS_NEXT: Partial<Record<OrderStatus, OrderStatus[]>> = {
  PENDING: ['PREPARING', 'CANCELLED'],
  PREPARING: ['READY', 'CANCELLED'],
  READY: ['PARTIALLY_DELIVERED', 'DELIVERED', 'CANCELLED'],
  PARTIALLY_DELIVERED: ['DELIVERED', 'CANCELLED'],
  DELIVERED: ['INVOICED'],
  INVOICED: [],
  CANCELLED: [],
};

const STATUS_LABEL_GR: Record<OrderStatus, string> = {
  PENDING: 'Εκκρεμής',
  PREPARING: 'Σε ετοιμασία',
  READY: 'Έτοιμη',
  PARTIALLY_DELIVERED: 'Μερική παράδοση',
  DELIVERED: 'Παραδομένη',
  INVOICED: 'Τιμολογημένη',
  CANCELLED: 'Ακυρωμένη',
};

const ACTION_LABEL: Partial<Record<OrderStatus, string>> = {
  PREPARING: '→ Σε ετοιμασία',
  READY: '→ Έτοιμη',
  PARTIALLY_DELIVERED: '→ Μερική παράδοση',
  DELIVERED: '→ Παραδομένη',
  INVOICED: '→ Τιμολογημένη',
  CANCELLED: 'Ακύρωση',
};

function lineSubtotal(l: OrderLineEnriched): number {
  const discount = l.discount_pct ?? 0;
  return l.qty * l.unit_price * (1 - discount / 100);
}

export default function OrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, isLoading } = useOrder(id);
  const patch = usePatchOrder();
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfSheetOpen, setPdfSheetOpen] = useState(false);
  // The cancel-confirm overlay. Decoupled from the underlying button so we
  // don't accidentally swap state between the "in flight" patch mutation
  // and the "user is still deciding" pre-confirm state.
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);

  if (isLoading || !data) {
    return <div className="p-4 text-ink-500">Φόρτωση…</div>;
  }

  async function onGeneratePdf(detail: OrderDetailT, modes: DeliveryPdfMode[]) {
    if (modes.length === 0) return;
    setPdfBusy(true);
    try {
      // Lazy-import so jsPDF + autotable + fonts only land on first use.
      const { shareOrDownloadDeliveryPdf } = await import('@/lib/pdf-delivery');

      // Fetch photos only when the visual mode is selected. The endpoint
      // is server-side aggregated and base64-encodes each plant photo,
      // so it can be a few MB on heavy orders — only pay the cost when
      // we actually need it.
      let photos: Record<string, string> = {};
      if (modes.includes('visual')) {
        try {
          photos = await apiFetch<Record<string, string>>(`/api/orders/${detail.order.id}/photos`);
        } catch {
          // Visual list still renders — every line falls back to the
          // "No photo" placeholder if the fetch fails.
          toast.error('Δεν φορτώθηκαν οι φωτογραφίες — placeholder');
        }
      }

      // DN number: server-assigned DNs would live on detail.deliveryNotes
      // — for v1 we fall back to a deterministic preview number based on
      // the order number so the PDF always has something in the slot.
      const dnNumber = detail.order.order_number.replace(/^ORD-/, 'DN-');

      const result = await shareOrDownloadDeliveryPdf(detail, { modes, dnNumber, photos });
      toast.success(result === 'shared' ? 'PDF διαμοιράστηκε' : 'PDF κατέβηκε');
      setPdfSheetOpen(false);
    } catch (err) {
      console.error('PDF export failed:', err);
      toast.error('Αποτυχία δημιουργίας PDF');
    } finally {
      setPdfBusy(false);
    }
  }

  const { order, lines, customer } = data;
  const customerName = customer?.trading_name || customer?.legal_name || 'Άγνωστος πελάτης';
  const customerLegal = customer && customer.trading_name && customer.legal_name !== customer.trading_name
    ? customer.legal_name
    : null;
  // Subtotal (net) + VAT breakdown + grand total (gross)
  const subtotal = lines.reduce((s, l) => s + lineSubtotal(l), 0);
  const breakdown = vatBreakdown(
    lines.map((l) => ({ net: lineSubtotal(l), vat_rate: l.vat_rate ?? 19 })),
  );
  const vatTotal = breakdown.reduce((s, r) => s + r.amount, 0);
  const grandTotal = subtotal + vatTotal;

  async function changeStatus(next: OrderStatus) {
    try {
      await patch.mutateAsync({ id: order.id, status: next });
      toast.success(`Status: ${STATUS_LABEL_GR[next]}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Σφάλμα');
    }
  }

  const nextStatuses = STATUS_NEXT[order.status] ?? [];
  // Primary action (first non-cancellation) gets the prominent button.
  const primaryAction = nextStatuses.find((s) => s !== 'CANCELLED');
  const cancelAction = nextStatuses.find((s) => s === 'CANCELLED');

  return (
    <div className="min-h-screen pb-10">
      <header
        className="pt-safe"
        style={{ padding: '14px 20px 8px', display: 'flex', alignItems: 'center', gap: 12 }}
      >
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="Πίσω"
          className="ios-tap"
          style={{
            width: 36, height: 36, marginLeft: -8, borderRadius: 999,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--ink-700)',
          }}
        >
          <ArrowLeft size={18} />
        </button>

        {/* Repeat-order action — copies this order's customer + lines into a
            fresh wizard draft. B2B plant customers tend to re-order the same
            mix weekly/monthly; this turns a 4-step wizard into a
            review-and-submit. Delivery date + order notes are intentionally
            NOT carried over (they belong to the new fulfilment context). */}
        <button
          type="button"
          onClick={() => {
            navigate('/orders/new', {
              state: {
                duplicate: {
                  customer: data?.customer ?? null,
                  lines: (data?.lines ?? []).map((l) => ({
                    variant_id: l.variant_id,
                    qty: l.qty,
                    unit_price: l.unit_price,
                    vat_rate: l.vat_rate ?? 19,
                    description: l.description ?? '',
                  })),
                  fromOrderNumber: data?.order.order_number,
                },
              },
            });
          }}
          aria-label="Επανάληψη παραγγελίας"
          className="ios-tap"
          style={{
            marginLeft: 'auto',
            display: 'inline-flex', alignItems: 'center', gap: 6,
            height: 36, padding: '0 12px',
            borderRadius: 999,
            background: 'var(--sage-100)',
            color: 'var(--sage-800)',
            fontSize: 12,
            fontWeight: 500,
          }}
        >
          <Repeat size={14} strokeWidth={1.8} />
          Επανάληψη
        </button>
      </header>

      {/* Customer header */}
      <section style={{ padding: '4px 20px 0' }}>
        <div className="font-mono-meta" style={{ fontSize: 11, color: 'var(--ink-500)', letterSpacing: '0.06em' }}>
          {order.order_number}
        </div>
        <h1
          className="font-display"
          style={{ fontSize: 26, lineHeight: 1.1, marginTop: 4, color: 'var(--ink-900)', fontWeight: 500 }}
        >
          {customerName}
        </h1>
        {customerLegal && (
          <p style={{ fontSize: 13, color: 'var(--ink-500)', marginTop: 4 }}>{customerLegal}</p>
        )}
      </section>

      {/* Status timeline */}
      <section style={{ padding: '20px 20px 0' }}>
        <StatusTimeline current={order.status} />
      </section>

      {/* Delivery card */}
      <section style={{ padding: '18px 20px 0' }}>
        <div
          style={{
            background: '#fff',
            borderRadius: 16,
            boxShadow: 'var(--shadow-card)',
            padding: 16,
          }}
        >
          <div className="text-eyebrow" style={{ marginBottom: 6 }}>Παράδοση</div>
          <p style={{ fontSize: 15, fontWeight: 500 }}>{fmtLongDate(order.delivery_date)}</p>
        </div>
      </section>

      {/* Totals breakdown card */}
      <section style={{ padding: '12px 20px 0' }}>
        <div
          style={{
            background: '#fff',
            borderRadius: 16,
            boxShadow: 'var(--shadow-card)',
            padding: 16,
          }}
        >
          <div className="folio" style={{ marginBottom: 10 }}><span>Τιμολόγηση</span></div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
            <span style={{ fontSize: 13, color: 'var(--ink-500)' }}>Υποσύνολο</span>
            <span className="font-mono-meta" style={{ fontSize: 13, color: 'var(--ink-700)' }}>
              {fmtEUR(subtotal)}
            </span>
          </div>
          {breakdown.map((row) => (
            <div
              key={row.rate}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}
            >
              <span style={{ fontSize: 13, color: 'var(--ink-500)' }}>
                {VAT_LABEL[row.rate]}
                <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--ink-300)' }}>
                  επί {fmtEUR(row.net)}
                </span>
              </span>
              <span className="font-mono-meta" style={{ fontSize: 13, color: 'var(--ink-700)' }}>
                {fmtEUR(row.amount)}
              </span>
            </div>
          ))}
          <div className="hairline" style={{ margin: '10px 0 8px' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--sage-800)' }}>Σύνολο</span>
            <span className="font-mono-meta" style={{ fontSize: 20, fontWeight: 500, color: 'var(--sage-800)' }}>
              {fmtEUR(grandTotal)}
            </span>
          </div>
        </div>
      </section>

      {/* Lines */}
      <section style={{ padding: '20px 20px 0' }}>
        <div className="folio" style={{ marginBottom: 10 }}>
          <span className="folio-num">{String(lines.length).padStart(2, '0')}</span>
          <span>γραμμές</span>
        </div>
        <div
          style={{
            background: '#fff',
            borderRadius: 16,
            boxShadow: 'var(--shadow-card)',
            overflow: 'hidden',
          }}
        >
          {lines.map((l, i) => {
            // Plant name resolution: scientific name first, fall back to the
            // free-text description only when there's no plant lookup
            // (legacy / detached lines). We check for a separate per-line
            // *note* further down to avoid double-displaying a description
            // that's being used as the plant-name fallback.
            const hasPlantName = !!prettyScientificName(l.plant_scientific_name);
            const name = prettyScientificName(l.plant_scientific_name) || l.description || l.variant_id;
            const size = cleanSizeSummary(l.size_summary);
            // Only show the per-line note when there IS a real plant name —
            // otherwise the description is already the title and would render
            // twice.
            const note = hasPlantName ? l.description?.trim() : null;
            return (
              <div key={l.id}>
                {i > 0 && <div className="hairline" style={{ margin: '0 16px' }} />}
                <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p
                      className="font-display"
                      style={{ fontStyle: 'italic', fontSize: 14, fontWeight: 500 }}
                    >
                      {name}
                    </p>
                    <p
                      className="font-mono-meta"
                      style={{
                        fontSize: 10,
                        color: 'var(--ink-500)',
                        marginTop: 2,
                        letterSpacing: '0.05em',
                        textTransform: 'uppercase',
                      }}
                    >
                      {size ? `${size} · ` : ''}{l.qty} × {fmtEUR(l.unit_price)}
                    </p>
                    {note && (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: 5,
                          marginTop: 6,
                          padding: '6px 8px',
                          background: 'var(--cream-200)',
                          borderRadius: 8,
                        }}
                      >
                        <span style={{ fontSize: 11, lineHeight: 1.2 }} aria-hidden="true">💬</span>
                        <p style={{ fontSize: 11, color: 'var(--ink-700)', lineHeight: 1.4, flex: 1 }}>
                          {note}
                        </p>
                      </div>
                    )}
                  </div>
                  <span className="font-mono-meta" style={{ fontSize: 13, fontWeight: 500, marginTop: 2 }}>
                    {fmtEUR(lineSubtotal(l))}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* PDF export — opens action sheet to pick which delivery doc(s) */}
      <section style={{ padding: '20px 20px 0' }}>
        <button
          type="button"
          onClick={() => setPdfSheetOpen(true)}
          className="btn-secondary ios-tap"
          style={{ height: 48 }}
        >
          <FileText size={16} color="var(--sage-700)" strokeWidth={1.75} />
          Λήψη / Εκτύπωση
        </button>
      </section>

      <PdfActionSheet
        open={pdfSheetOpen}
        onClose={() => setPdfSheetOpen(false)}
        busy={pdfBusy}
        onGenerate={(modes) => onGeneratePdf(data, modes)}
      />

      {/* Notes */}
      {order.notes && (
        <section style={{ padding: '20px 20px 0' }}>
          <div className="folio" style={{ marginBottom: 8 }}><span>Σημειώσεις</span></div>
          <p
            style={{
              fontSize: 13,
              color: 'var(--ink-700)',
              lineHeight: 1.5,
              padding: '12px 14px',
              background: 'var(--cream-200)',
              borderRadius: 12,
            }}
          >
            {order.notes}
          </p>
        </section>
      )}

      {/* Status actions */}
      {nextStatuses.length > 0 && (
        <section style={{ padding: '24px 20px 0' }}>
          <div className="folio" style={{ marginBottom: 10 }}><span>Επόμενη ενέργεια</span></div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {primaryAction && (
              <button
                type="button"
                disabled={patch.isPending}
                onClick={() => changeStatus(primaryAction)}
                className="btn-primary ios-tap"
                style={{ width: 'auto', flex: 1, height: 46, fontSize: 14 }}
              >
                {ACTION_LABEL[primaryAction] ?? STATUS_LABEL_GR[primaryAction]}
              </button>
            )}
            {cancelAction && (
              <button
                type="button"
                disabled={patch.isPending}
                onClick={() => setConfirmCancelOpen(true)}
                style={{
                  height: 46,
                  padding: '0 18px',
                  borderRadius: 14,
                  background: '#fff',
                  border: '1px solid rgba(63,75,70,0.10)',
                  fontSize: 14,
                  color: 'var(--accent-clay)',
                  fontWeight: 500,
                }}
              >
                Ακύρωση
              </button>
            )}
          </div>
        </section>
      )}

      {/* Cancel-order confirmation overlay.
          The primary action button ("→ Έτοιμη" etc) sits inches from the
          destructive "Ακύρωση". A misfire on a small phone was identified
          in the UX audit as a real safety risk — wrapping the cancel in an
          explicit confirm avoids accidental data loss. */}
      {confirmCancelOpen && cancelAction && (
        <div
          onClick={() => setConfirmCancelOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 1500,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex', alignItems: 'flex-end',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="pb-safe"
            style={{
              width: '100%',
              background: '#fff',
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              padding: '20px 20px 16px',
            }}
          >
            <div className="text-eyebrow" style={{ marginBottom: 8 }}>Επιβεβαίωση</div>
            <h3
              className="font-display"
              style={{
                fontStyle: 'italic',
                fontSize: 22,
                fontWeight: 500,
                color: 'var(--ink-900)',
                marginBottom: 6,
                lineHeight: 1.15,
              }}
            >
              Ακύρωση παραγγελίας;
            </h3>
            <p style={{ fontSize: 13, color: 'var(--ink-500)', lineHeight: 1.5, marginBottom: 18 }}>
              Η παραγγελία <strong style={{ color: 'var(--ink-700)' }}>{order.order_number}</strong> θα
              σημανθεί ως ακυρωμένη. Η ενέργεια δεν επιστρέφεται από το PWA — θα χρειαστεί παρέμβαση
              από το desktop bloom-crm για επαναφορά.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={() => setConfirmCancelOpen(false)}
                style={{
                  flex: 1, height: 48, borderRadius: 14,
                  background: '#fff',
                  border: '1px solid rgba(63,75,70,0.12)',
                  fontSize: 14, fontWeight: 500,
                  color: 'var(--ink-700)',
                }}
              >
                Όχι, πίσω
              </button>
              <button
                type="button"
                disabled={patch.isPending}
                onClick={() => {
                  setConfirmCancelOpen(false);
                  void changeStatus(cancelAction);
                }}
                style={{
                  flex: 1, height: 48, borderRadius: 14,
                  background: 'var(--accent-clay)',
                  border: 'none',
                  fontSize: 14, fontWeight: 500,
                  color: '#fff',
                }}
              >
                Ναι, ακύρωση
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

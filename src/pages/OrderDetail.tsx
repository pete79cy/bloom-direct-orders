import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText } from 'lucide-react';
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
    <div className="min-h-full pb-10">
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
            const name = prettyScientificName(l.plant_scientific_name) || l.description || l.variant_id;
            const size = cleanSizeSummary(l.size_summary);
            return (
              <div key={l.id}>
                {i > 0 && <div className="hairline" style={{ margin: '0 16px' }} />}
                <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
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
                  </div>
                  <span className="font-mono-meta" style={{ fontSize: 13, fontWeight: 500 }}>
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
                onClick={() => changeStatus(cancelAction)}
                style={{
                  height: 46,
                  padding: '0 18px',
                  borderRadius: 14,
                  background: '#fff',
                  border: '1px solid rgba(63,75,70,0.10)',
                  fontSize: 14,
                  color: 'var(--ink-700)',
                }}
              >
                Ακύρωση
              </button>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

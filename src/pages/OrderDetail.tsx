import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, Eye, FileText, Minus, Pencil, Plus, Repeat, Send, Trash2, Truck, X } from 'lucide-react';
import { toast } from 'sonner';
import { useOrder, usePatchOrder, useCreateAmendment, type AmendmentRequest } from '@/lib/queries';
import { fmtEUR, fmtLongDate } from '@/lib/format';
import { getUser } from '@/lib/auth';
import StatusTimeline from '@/components/StatusTimeline';
import PdfActionSheet from '@/components/PdfActionSheet';
import OrderTotalPresentView, { type PresentLine } from '@/components/OrderTotalPresentView';
import OrderSupplierBreakdownView from '@/components/OrderSupplierBreakdownView';
import NotifyCustomerSheet from '@/components/NotifyCustomerSheet';
import AddLineSheet, { type AddLineResult } from '@/components/AddLineSheet';
import VariantPickerSheet from '@/components/VariantPickerSheet';
import { prettyScientificName, cleanSizeSummary } from '@/lib/plant-display';
import { vatBreakdown, VAT_LABEL } from '@/lib/vat';
import { apiFetch } from '@/lib/api';
import type { DeliveryPdfMode } from '@/lib/pdf-delivery';
import type { OrderStatus, OrderLineEnriched, OrderDetail as OrderDetailT, Plant, Variant } from '@/types';

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

function fmtNotifiedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('el-GR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

export default function OrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, isLoading } = useOrder(id);
  const patch = usePatchOrder();
  const createAmendment = useCreateAmendment();
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfSheetOpen, setPdfSheetOpen] = useState(false);
  // Two read-only full-screen overlays for showing the order to the
  // customer / for sourcing planning. Decoupled state — opening one
  // does not close the other (it can't anyway: they're modal).
  const [presentTotalOpen, setPresentTotalOpen] = useState(false);
  const [supplierBreakdownOpen, setSupplierBreakdownOpen] = useState(false);
  const [notifyOpen, setNotifyOpen] = useState(false);
  // The cancel-confirm overlay. Decoupled from the underlying button so we
  // don't accidentally swap state between the "in flight" patch mutation
  // and the "user is still deciding" pre-confirm state.
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);

  // ── Inline edit mode ──────────────────────────────────────────────
  // Operators need to fix orders in the field — qty / price corrections,
  // adding a forgotten line, removing one the customer dropped. The
  // server-side amendments system already supports it (POST /api/orders/
  // :orderId/amendments with confirm:true). On the PWA we collect all
  // changes locally, diff against the saved order on Save, and emit one
  // amendment per change in sequence. Each amendment goes through the
  // existing applyAmendmentToOrder transaction so the audit trail lands
  // on bloom-crm exactly as if the user had edited from desktop.
  const [editMode, setEditMode] = useState(false);
  const [editedQty, setEditedQty] = useState<Record<string, number>>({});
  const [editedPrice, setEditedPrice] = useState<Record<string, number>>({});
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  const [addedLines, setAddedLines] = useState<Array<{
    tmpId: string;
    variant_id: string;
    qty: number;
    unit_price: number;
    vat_rate: number;
    description: string;
    plant_common_name: string | null;
    plant_scientific_name: string | null;
    size_summary: string | null;
  }>>([]);
  const [addLineSheetOpen, setAddLineSheetOpen] = useState(false);
  const [addPickedVariant, setAddPickedVariant] = useState<{ variant: Variant; plant: Plant | undefined } | null>(null);
  const [saving, setSaving] = useState(false);
  const [variantPickerOpen, setVariantPickerOpen] = useState(false);

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

  // Live preview of edits — when in edit mode, totals must reflect what
  // the operator is about to submit, not what's still on the server. We
  // compose two streams: existing-line states (with optional qty/price
  // overrides and a removed filter) + added lines that don't exist yet
  // server-side. discount_pct stays at the server value — the PWA edit
  // flow doesn't let the operator change it.
  function effectiveLineNet(l: OrderLineEnriched): number {
    const qty = editedQty[l.id] ?? l.qty;
    const unit = editedPrice[l.id] ?? l.unit_price;
    const discount = l.discount_pct ?? 0;
    return qty * unit * (1 - discount / 100);
  }

  const existingForTotals = lines
    .filter((l) => !removedIds.has(l.id))
    .map((l) => ({ net: effectiveLineNet(l), vat_rate: l.vat_rate ?? 19 }));
  const addedForTotals = addedLines.map((a) => ({
    net: a.qty * a.unit_price,
    vat_rate: a.vat_rate,
  }));

  const subtotal = [...existingForTotals, ...addedForTotals].reduce((s, r) => s + r.net, 0);
  const breakdown = vatBreakdown([...existingForTotals, ...addedForTotals]);
  const vatTotal = breakdown.reduce((s, r) => s + r.amount, 0);
  const grandTotal = subtotal + vatTotal;

  // Pre-compute whether anything actually changed vs the saved order.
  // Plain const, NOT useMemo — we sit below the `if (isLoading || !data)
  // return ...` early return up top, and a useMemo here would be a
  // Rules-of-Hooks violation (hook count changes between the loading
  // render and the loaded one → React throws → "Κάτι πήγε στραβά").
  // The list scans are O(lines) and only run once per render anyway,
  // matching the local-const style of `subtotal` / `breakdown` above.
  let hasUnsavedChanges = false;
  if (removedIds.size > 0 || addedLines.length > 0) {
    hasUnsavedChanges = true;
  } else {
    for (const l of lines) {
      const q = editedQty[l.id];
      const p = editedPrice[l.id];
      if ((q !== undefined && q !== l.qty) || (p !== undefined && p !== l.unit_price)) {
        hasUnsavedChanges = true;
        break;
      }
    }
  }

  const canEdit = !['INVOICED', 'CANCELLED'].includes(order.status);
  // Same Rules-of-Hooks reason — plain const, not useMemo.
  const excludeVariantIds = [
    ...lines.filter((l) => !removedIds.has(l.id)).map((l) => l.variant_id),
    ...addedLines.map((a) => a.variant_id),
  ];

  // Lines shaped for the customer-facing present view. Plain const —
  // declaring this as a useMemo would be a Rules-of-Hooks violation
  // because we sit below the `if (isLoading || !data) return ...` early
  // return above. Plus a single map over the lines is cheap; matching
  // the local-const style of `subtotal` / `breakdown` keeps the file
  // consistent.
  //
  // Name resolution differs from the inline lines list above: this is the
  // CUSTOMER-FACING present view, so the Greek common name takes priority
  // over the Latin binomial. We still fall back through scientific →
  // description → variant id so legacy / free-text / draft lines always
  // surface something legible.
  const presentLines: PresentLine[] = lines.map((l) => {
    const common = l.plant_common_name?.trim();
    const sci = prettyScientificName(l.plant_scientific_name);
    const name = common || sci || l.description || l.variant_id;
    return {
      id: l.id,
      description: name,
      qty: l.qty,
      unitPrice: l.unit_price,
      lineTotal: lineSubtotal(l),
    };
  });

  function handleEnterEdit() {
    setEditMode(true);
  }
  function handleCancelEdit() {
    setEditedQty({});
    setEditedPrice({});
    setRemovedIds(new Set());
    setAddedLines([]);
    setAddPickedVariant(null);
    setVariantPickerOpen(false);
    setAddLineSheetOpen(false);
    setEditMode(false);
  }

  function handleVariantPicked(variant: Variant, _plant: Plant | undefined) {
    // Picked from VariantPickerSheet → hand off to AddLineSheet for
    // qty/price/vat confirmation. The configured line lands in
    // addedLines on commit (handleAddLineCommit).
    setAddPickedVariant({ variant, plant: _plant });
    setAddLineSheetOpen(true);
  }

  function handleAddLineCommit(result: AddLineResult) {
    if (!addPickedVariant) return;
    const { variant: v, plant: p } = addPickedVariant;
    const size = cleanSizeSummary([
      v.pot_volume_l ? `P${v.pot_volume_l}L` : '',
      v.height_min_cm ? `H${v.height_min_cm}-${v.height_max_cm || v.height_min_cm}` : '',
    ].filter(Boolean).join(' ')) || null;
    setAddedLines((prev) => [
      ...prev,
      {
        tmpId: `new-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        variant_id: v.id,
        qty: result.qty,
        unit_price: result.unit_price,
        vat_rate: result.vat_rate,
        description: result.description,
        plant_common_name: p?.common_name ?? null,
        plant_scientific_name: p?.scientific_name ?? null,
        size_summary: size,
      },
    ]);
    setAddPickedVariant(null);
    setAddLineSheetOpen(false);
  }

  async function handleSaveEdits() {
    const user = getUser();
    const requestedBy = user?.name || user?.email || 'pwa';

    const ops: AmendmentRequest[] = [];

    // 1. REMOVE — process before edits so we don't waste a server roundtrip
    //    on a line that's about to be cancelled anyway.
    for (const l of lines) {
      if (removedIds.has(l.id)) {
        ops.push({ type: 'REMOVE', target_order_line_id: l.id });
      }
    }

    // 2. QTY_CHANGE / PRICE_CHANGE on surviving lines. QTY_CHANGE on the
    //    server happily accepts a new_unit_price too, so combine when both
    //    changed — saves an amendment row + a network roundtrip.
    for (const l of lines) {
      if (removedIds.has(l.id)) continue;
      const newQty = editedQty[l.id];
      const newPrice = editedPrice[l.id];
      const qtyChanged = newQty !== undefined && newQty !== l.qty;
      const priceChanged = newPrice !== undefined && newPrice !== l.unit_price;
      if (qtyChanged && priceChanged) {
        ops.push({
          type: 'QTY_CHANGE',
          target_order_line_id: l.id,
          new_qty: newQty,
          new_unit_price: newPrice,
        });
      } else if (qtyChanged) {
        ops.push({
          type: 'QTY_CHANGE',
          target_order_line_id: l.id,
          new_qty: newQty,
        });
      } else if (priceChanged) {
        ops.push({
          type: 'PRICE_CHANGE',
          target_order_line_id: l.id,
          new_unit_price: newPrice,
        });
      }
    }

    // 3. ADD — new lines last so any failures roll back without affecting
    //    pre-existing data ordering on the page.
    for (const a of addedLines) {
      ops.push({
        type: 'ADD',
        new_variant_id: a.variant_id,
        new_qty: a.qty,
        new_unit_price: a.unit_price,
      });
    }

    if (ops.length === 0) {
      setEditMode(false);
      return;
    }

    setSaving(true);
    let succeeded = 0;
    try {
      for (const op of ops) {
        await createAmendment.mutateAsync({
          orderId: order.id,
          amendment: {
            ...op,
            requested_by_party: 'NURSERY',
            requested_by_user: requestedBy,
            confirm: true,
          },
        });
        succeeded++;
      }
      toast.success(
        ops.length === 1
          ? 'Η αλλαγή αποθηκεύτηκε'
          : `${ops.length} αλλαγές αποθηκεύτηκαν`,
      );
      handleCancelEdit();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Σφάλμα';
      if (succeeded > 0) {
        toast.error(`Αποθηκεύτηκαν ${succeeded}/${ops.length}. Αποτυχία: ${msg}`);
      } else {
        toast.error(`Αποτυχία: ${msg}`);
      }
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(next: OrderStatus) {
    try {
      await patch.mutateAsync({ id: order.id, status: next });
      toast.success(`Status: ${STATUS_LABEL_GR[next]}`);
      // Auto-open the customer notification sheet the moment an order
      // becomes READY — the operator usually wants to message right away.
      if (next === 'READY') setNotifyOpen(true);
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

      {/* Present-mode CTAs — full-screen, high-contrast overlays for showing
          the order to the customer (the green CTA) or to a sourcing planner
          (the cream secondary CTA: who supplies what). Both are read-only;
          they sit here, above the lines, so they're reachable without any
          scrolling once the customer opens the order. */}
      <section style={{ padding: '14px 20px 0' }}>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="button"
            onClick={() => setPresentTotalOpen(true)}
            className="ios-tap"
            aria-label="Προβολή συνόλου"
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              height: 48,
              borderRadius: 14,
              border: 0,
              cursor: 'pointer',
              background: 'var(--sage-700)',
              color: 'var(--cream-50)',
              fontSize: 15,
              fontWeight: 600,
            }}
          >
            <Eye size={18} strokeWidth={2} />
            Προβολή συνόλου
          </button>
          <button
            type="button"
            onClick={() => setSupplierBreakdownOpen(true)}
            className="ios-tap"
            aria-label="Ανά προμηθευτή"
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              height: 48,
              borderRadius: 14,
              border: '1px solid rgba(47,79,68,0.18)',
              cursor: 'pointer',
              background: '#fff',
              color: 'var(--sage-800)',
              fontSize: 15,
              fontWeight: 600,
            }}
          >
            <Truck size={18} strokeWidth={2} />
            Ανά προμηθευτή
          </button>
        </div>
      </section>

      {/* Lines — toggles between read-only + editable mode. Edit pill sits
          on the section header rather than the page top because the actual
          editable surface is here. */}
      <section style={{ padding: '20px 20px 0' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 10,
          }}
        >
          <div className="folio">
            <span className="folio-num">
              {String(lines.filter((l) => !removedIds.has(l.id)).length + addedLines.length).padStart(2, '0')}
            </span>
            <span>γραμμές</span>
          </div>

          {canEdit && !editMode && (
            <button
              type="button"
              onClick={handleEnterEdit}
              className="ios-tap"
              aria-label="Επεξεργασία γραμμών"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                height: 32, padding: '0 12px',
                borderRadius: 999, border: 0,
                background: 'var(--sage-100, #E6EEE2)',
                color: 'var(--sage-800)',
                fontSize: 13, fontWeight: 600, cursor: 'pointer',
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
                onClick={handleCancelEdit}
                disabled={saving}
                className="ios-tap"
                aria-label="Ακύρωση επεξεργασίας"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  height: 32, padding: '0 12px',
                  borderRadius: 999, border: '1px solid rgba(63,75,70,0.18)',
                  background: '#fff',
                  color: 'var(--ink-700)',
                  fontSize: 13, fontWeight: 600,
                  cursor: saving ? 'default' : 'pointer',
                  opacity: saving ? 0.6 : 1,
                }}
              >
                <X size={14} strokeWidth={2.2} />
                Ακύρωση
              </button>
              <button
                type="button"
                onClick={handleSaveEdits}
                disabled={!hasUnsavedChanges || saving}
                className="ios-tap"
                aria-label="Αποθήκευση αλλαγών"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  height: 32, padding: '0 14px',
                  borderRadius: 999, border: 0,
                  background: hasUnsavedChanges && !saving ? 'var(--sage-700)' : 'var(--cream-200)',
                  color: hasUnsavedChanges && !saving ? 'var(--cream-50)' : 'var(--ink-500)',
                  fontSize: 13, fontWeight: 600,
                  cursor: hasUnsavedChanges && !saving ? 'pointer' : 'default',
                }}
              >
                <Check size={14} strokeWidth={2.4} />
                {saving ? 'Αποθήκευση…' : 'Αποθήκευση'}
              </button>
            </div>
          )}
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
            const hasPlantName = !!prettyScientificName(l.plant_scientific_name);
            const name = prettyScientificName(l.plant_scientific_name) || l.description || l.variant_id;
            const size = cleanSizeSummary(l.size_summary);
            const note = hasPlantName ? l.description?.trim() : null;
            const isRemoved = removedIds.has(l.id);
            const qtyVal = editedQty[l.id] ?? l.qty;
            const priceVal = editedPrice[l.id] ?? l.unit_price;
            const effectiveNet = effectiveLineNet(l);

            return (
              <div key={l.id}>
                {i > 0 && <div className="hairline" style={{ margin: '0 16px' }} />}
                <div
                  style={{
                    padding: '12px 16px',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 12,
                    opacity: isRemoved ? 0.45 : 1,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p
                      className="font-display"
                      style={{
                        fontStyle: 'italic',
                        fontSize: 14,
                        fontWeight: 500,
                        textDecoration: isRemoved ? 'line-through' : 'none',
                      }}
                    >
                      {name}
                    </p>
                    {l.variant_status === 'draft' && (
                      <p
                        className="text-eyebrow"
                        style={{
                          fontSize: 9,
                          marginTop: 2,
                          color: 'var(--clay)',
                          letterSpacing: '0.15em',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        <span aria-hidden="true">⚠</span> ΠΡΟΧΕΙΡΟ
                      </p>
                    )}
                    {!editMode && (
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
                    )}
                    {editMode && (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          marginTop: 6,
                          flexWrap: 'wrap',
                        }}
                      >
                        {/* Qty stepper */}
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            borderRadius: 8,
                            border: '1px solid rgba(63,75,70,0.18)',
                            background: isRemoved ? 'var(--cream-200)' : '#fff',
                            overflow: 'hidden',
                          }}
                        >
                          <button
                            type="button"
                            disabled={isRemoved || qtyVal <= 1}
                            onClick={() =>
                              setEditedQty((m) => ({ ...m, [l.id]: Math.max(1, qtyVal - 1) }))
                            }
                            aria-label="Μείωση"
                            style={{
                              width: 32, height: 32, border: 0,
                              background: 'transparent', color: 'var(--ink-700)',
                              cursor: isRemoved || qtyVal <= 1 ? 'default' : 'pointer',
                              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            }}
                          >
                            <Minus size={14} />
                          </button>
                          <input
                            type="number"
                            inputMode="numeric"
                            value={qtyVal}
                            onChange={(e) => {
                              const n = Number.parseInt(e.target.value, 10);
                              if (!Number.isNaN(n) && n >= 1) {
                                setEditedQty((m) => ({ ...m, [l.id]: n }));
                              } else if (e.target.value === '') {
                                setEditedQty((m) => ({ ...m, [l.id]: 1 }));
                              }
                            }}
                            disabled={isRemoved}
                            className="font-mono-meta"
                            style={{
                              width: 44, height: 32,
                              border: 0, outline: 'none',
                              background: 'transparent',
                              textAlign: 'center', fontSize: 14, fontWeight: 600,
                              color: 'var(--ink-900)',
                              MozAppearance: 'textfield',
                            }}
                          />
                          <button
                            type="button"
                            disabled={isRemoved}
                            onClick={() =>
                              setEditedQty((m) => ({ ...m, [l.id]: qtyVal + 1 }))
                            }
                            aria-label="Αύξηση"
                            style={{
                              width: 32, height: 32, border: 0,
                              background: 'transparent', color: 'var(--ink-700)',
                              cursor: isRemoved ? 'default' : 'pointer',
                              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            }}
                          >
                            <Plus size={14} />
                          </button>
                        </div>
                        {/* Price input */}
                        <label
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '4px 10px',
                            borderRadius: 8,
                            border: '1px solid rgba(63,75,70,0.18)',
                            background: isRemoved ? 'var(--cream-200)' : '#fff',
                            height: 32,
                          }}
                        >
                          <span style={{ fontSize: 13, color: 'var(--ink-500)' }}>€</span>
                          <input
                            type="number"
                            inputMode="decimal"
                            step="0.01"
                            min="0"
                            value={priceVal}
                            onChange={(e) => {
                              const n = Number.parseFloat(e.target.value);
                              if (!Number.isNaN(n) && n >= 0) {
                                setEditedPrice((m) => ({ ...m, [l.id]: n }));
                              } else if (e.target.value === '') {
                                setEditedPrice((m) => ({ ...m, [l.id]: 0 }));
                              }
                            }}
                            disabled={isRemoved}
                            className="font-mono-meta"
                            style={{
                              width: 64,
                              border: 0, outline: 'none',
                              background: 'transparent',
                              fontSize: 14, fontWeight: 600,
                              color: 'var(--ink-900)',
                            }}
                          />
                        </label>
                        {/* Remove toggle */}
                        <button
                          type="button"
                          onClick={() =>
                            setRemovedIds((set) => {
                              const next = new Set(set);
                              if (next.has(l.id)) next.delete(l.id);
                              else next.add(l.id);
                              return next;
                            })
                          }
                          className="ios-tap"
                          aria-label={isRemoved ? 'Επαναφορά γραμμής' : 'Αφαίρεση γραμμής'}
                          style={{
                            width: 32, height: 32,
                            borderRadius: 8,
                            border: '1px solid rgba(63,75,70,0.18)',
                            background: isRemoved ? 'var(--clay, #B85C38)' : '#fff',
                            color: isRemoved ? '#fff' : 'var(--clay, #B85C38)',
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer',
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
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
                  <span
                    className="font-mono-meta"
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      marginTop: 2,
                      textDecoration: isRemoved ? 'line-through' : 'none',
                      color: isRemoved ? 'var(--ink-500)' : 'var(--ink-900)',
                    }}
                  >
                    {fmtEUR(effectiveNet)}
                  </span>
                </div>
              </div>
            );
          })}

          {/* Added (unsaved) lines */}
          {addedLines.map((a, i) => {
            const name = prettyScientificName(a.plant_scientific_name) || a.plant_common_name || a.description || a.variant_id;
            return (
              <div key={a.tmpId}>
                {(lines.length > 0 || i > 0) && <div className="hairline" style={{ margin: '0 16px' }} />}
                <div
                  style={{
                    padding: '12px 16px',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 12,
                    background: 'var(--sage-50, #F4F7F3)',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p
                      className="font-display"
                      style={{ fontStyle: 'italic', fontSize: 14, fontWeight: 500 }}
                    >
                      {name}
                    </p>
                    <p
                      className="text-eyebrow"
                      style={{
                        fontSize: 9,
                        marginTop: 2,
                        color: 'var(--sage-700)',
                        letterSpacing: '0.15em',
                      }}
                    >
                      ΝΕΑ
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
                      {a.size_summary ? `${a.size_summary} · ` : ''}{a.qty} × {fmtEUR(a.unit_price)}
                    </p>
                  </div>
                  <span className="font-mono-meta" style={{ fontSize: 13, fontWeight: 500, marginTop: 2 }}>
                    {fmtEUR(a.qty * a.unit_price)}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setAddedLines((prev) => prev.filter((x) => x.tmpId !== a.tmpId))
                    }
                    aria-label="Αφαίρεση νέας γραμμής"
                    style={{
                      width: 28, height: 28,
                      borderRadius: 6,
                      border: 0,
                      background: 'transparent',
                      color: 'var(--clay)',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer',
                      flexShrink: 0,
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {editMode && (
          <button
            type="button"
            onClick={() => setVariantPickerOpen(true)}
            className="ios-tap"
            style={{
              marginTop: 10,
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              height: 46,
              borderRadius: 14,
              border: '1.5px dashed rgba(47,79,68,0.30)',
              background: 'transparent',
              color: 'var(--sage-800)',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <Plus size={16} strokeWidth={2.2} />
            Νέα γραμμή
          </button>
        )}
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

      <OrderTotalPresentView
        open={presentTotalOpen}
        onClose={() => setPresentTotalOpen(false)}
        orderNumber={order.order_number}
        customerName={customerName}
        lines={presentLines}
        subtotal={subtotal}
        vatBreakdown={breakdown}
        grandTotal={grandTotal}
        formatEur={fmtEUR}
      />

      <OrderSupplierBreakdownView
        open={supplierBreakdownOpen}
        onClose={() => setSupplierBreakdownOpen(false)}
        orderId={order.id}
        orderNumber={order.order_number}
        customerName={customerName}
      />

      <NotifyCustomerSheet
        open={notifyOpen}
        onClose={() => setNotifyOpen(false)}
        orderId={order.id}
        orderNumber={order.order_number}
        customerName={customerName}
        customerPhone={customer?.phone}
      />

      {/* Variant picker for +Νέα γραμμή. Hands off to AddLineSheet when the
          operator picks one — we don't append directly because the user
          still needs to set qty/price/vat. */}
      <VariantPickerSheet
        open={variantPickerOpen}
        onClose={() => setVariantPickerOpen(false)}
        excludeVariantIds={excludeVariantIds}
        onPick={(variant, plant) => {
          setVariantPickerOpen(false);
          handleVariantPicked(variant, plant);
        }}
      />

      {/* AddLineSheet for configuring the picked variant. Mounts only once
          a variant has been picked. */}
      {addPickedVariant && (
        <AddLineSheet
          open={addLineSheetOpen}
          variant={addPickedVariant.variant}
          plant={addPickedVariant.plant}
          onClose={() => {
            setAddLineSheetOpen(false);
            setAddPickedVariant(null);
          }}
          onAdd={handleAddLineCommit}
        />
      )}

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

      {/* Customer notification — only meaningful once the order is READY. */}
      {order.status === 'READY' && (
        <section style={{ padding: '20px 20px 0' }}>
          <button
            type="button"
            onClick={() => setNotifyOpen(true)}
            className="btn-primary ios-tap"
            style={{ height: 50 }}
          >
            <Send size={16} color="var(--cream-50)" strokeWidth={1.9} />
            Ειδοποίηση πελάτη
          </button>
          {order.customer_notified_at && (
            <div
              className="font-mono-meta"
              style={{
                marginTop: 8, fontSize: 12, color: 'var(--sage-700)',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              <Check size={13} strokeWidth={2.4} />
              Ειδοποιήθηκε {fmtNotifiedAt(order.customer_notified_at)}
              {order.customer_notified_channel ? ` · ${order.customer_notified_channel}` : ''}
            </div>
          )}
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
                  color: 'var(--clay)',
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
                  background: 'var(--clay)',
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

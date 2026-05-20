import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { useOrder, usePatchOrder } from '@/lib/queries';
import { fmtEUR, fmtLongDate } from '@/lib/format';
import StatusBadge from '@/components/StatusBadge';
import type { OrderStatus, OrderLineEnriched } from '@/types';

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

function lineLabel(l: OrderLineEnriched): string {
  const parts = [l.plant_scientific_name, l.size_summary].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : l.description ?? l.variant_id;
}

function lineSubtotal(l: OrderLineEnriched): number {
  const discount = l.discount_pct ?? 0;
  return l.qty * l.unit_price * (1 - discount / 100);
}

export default function OrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, isLoading } = useOrder(id);
  const patch = usePatchOrder();

  if (isLoading || !data) {
    return <div className="p-4 text-ios-ink-sec">Φόρτωση…</div>;
  }

  const { order, lines, customer } = data;
  const customerName = customer?.trading_name || customer?.legal_name || 'Άγνωστος πελάτης';
  const total = lines.reduce((s, l) => s + lineSubtotal(l), 0);

  async function changeStatus(next: OrderStatus) {
    try {
      await patch.mutateAsync({ id: order.id, status: next });
      toast.success(`Status: ${STATUS_LABEL_GR[next]}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Σφάλμα');
    }
  }

  const nextStatuses = STATUS_NEXT[order.status] ?? [];

  return (
    <div className="min-h-full pb-24">
      <header className="px-4 pt-safe pt-4 pb-2 flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="Πίσω"
          className="p-2 -m-2"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="min-w-0">
          <h1 className="text-xl font-semibold truncate">{customerName}</h1>
          <p className="text-xs text-ios-ink-sec">{order.order_number}</p>
        </div>
        <div className="ml-auto">
          <StatusBadge status={order.status} />
        </div>
      </header>

      <section className="mx-4 mt-3 bg-white rounded-xl p-4 space-y-2">
        <Row label="Παράδοση" value={fmtLongDate(order.delivery_date)} />
        {order.notes && <Row label="Σημειώσεις" value={order.notes} />}
        <Row label="Σύνολο" value={fmtEUR(total)} bold />
      </section>

      <section className="mx-4 mt-4">
        <h2 className="text-sm font-medium text-ios-ink-sec uppercase tracking-wide mb-2">
          Γραμμές ({lines.length})
        </h2>
        <ul className="bg-white rounded-xl divide-y divide-gray-100">
          {lines.map((l) => (
            <li key={l.id} className="px-4 py-3">
              <p className="font-medium">{lineLabel(l)}</p>
              <p className="text-sm text-ios-ink-sec">
                {l.qty} × {fmtEUR(l.unit_price)} = {fmtEUR(lineSubtotal(l))}
              </p>
            </li>
          ))}
        </ul>
      </section>

      {nextStatuses.length > 0 && (
        <section className="mx-4 mt-6">
          <h2 className="text-sm font-medium text-ios-ink-sec uppercase tracking-wide mb-2">
            Αλλαγή status
          </h2>
          <div className="flex flex-wrap gap-2">
            {nextStatuses.map((s) => (
              <button
                key={s}
                type="button"
                disabled={patch.isPending}
                onClick={() => changeStatus(s)}
                className="px-4 h-10 rounded-xl bg-white border border-gray-200 disabled:opacity-50"
              >
                → {STATUS_LABEL_GR[s]}
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-sm text-ios-ink-sec">{label}</span>
      <span className={bold ? 'font-semibold' : ''}>{value}</span>
    </div>
  );
}

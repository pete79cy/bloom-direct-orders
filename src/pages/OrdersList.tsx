import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, ChevronRight } from 'lucide-react';
import { useOrders, useCustomers } from '@/lib/queries';
import { fmtShortDate } from '@/lib/format';
import StatusBadge from '@/components/StatusBadge';
import BottomNav from '@/components/BottomNav';
import type { OrderStatus } from '@/types';

const STATUS_FILTERS: ('ALL' | OrderStatus)[] = [
  'ALL', 'PENDING', 'PREPARING', 'READY', 'PARTIALLY_DELIVERED', 'DELIVERED', 'INVOICED', 'CANCELLED',
];

const STATUS_LABELS: Record<'ALL' | OrderStatus, string> = {
  ALL: 'Ενεργές',
  PENDING: 'Εκκρεμείς',
  PREPARING: 'Σε ετοιμασία',
  READY: 'Έτοιμες',
  PARTIALLY_DELIVERED: 'Μερική',
  DELIVERED: 'Παραδομένες',
  INVOICED: 'Τιμολογημένες',
  CANCELLED: 'Ακυρωμένες',
};

const HIDDEN_FROM_DEFAULT: OrderStatus[] = ['INVOICED', 'CANCELLED'];

export default function OrdersList() {
  const { data: orders = [] } = useOrders();
  const { data: customers = [] } = useCustomers();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'ALL' | OrderStatus>('ALL');

  const customerLabel = (id: string) => {
    const c = customers.find((x) => x.id === id);
    return c?.trading_name || c?.legal_name || 'Άγνωστος πελάτης';
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((o) => {
      if (filter === 'ALL' && HIDDEN_FROM_DEFAULT.includes(o.status)) return false;
      if (filter !== 'ALL' && o.status !== filter) return false;
      if (!q) return true;
      const label = customerLabel(o.customer_id).toLowerCase();
      return label.includes(q) || o.order_number.toLowerCase().includes(q);
    });
  }, [orders, customers, filter, search]);

  return (
    <div className="min-h-full pb-24">
      <header className="px-4 pt-safe pt-4 pb-2">
        <h1 className="text-2xl font-semibold">Παραγγελίες</h1>
      </header>

      <div className="px-4 mt-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ios-ink-sec" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Αναζήτηση πελάτη ή αριθμού"
            className="w-full h-11 pl-10 pr-4 rounded-xl bg-white border border-gray-200 text-base"
          />
        </div>
      </div>

      <div className="px-4 mt-3 overflow-x-auto -mx-1">
        <div className="flex gap-2 px-1">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setFilter(s)}
              className={
                'shrink-0 px-3 h-8 rounded-full text-sm border ' +
                (filter === s
                  ? 'bg-ios-tint text-white border-ios-tint'
                  : 'bg-white text-ios-ink border-gray-200')
              }
            >
              {STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      <ul className="mt-4 mx-4 bg-white rounded-xl divide-y divide-gray-100">
        {filtered.length === 0 ? (
          <li className="px-4 py-8 text-center text-ios-ink-sec">Καμία παραγγελία</li>
        ) : (
          filtered.map((o) => (
            <li key={o.id}>
              <Link
                to={`/orders/${o.id}`}
                className="flex items-center justify-between px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="font-medium truncate">{customerLabel(o.customer_id)}</p>
                  <p className="text-xs text-ios-ink-sec">
                    {o.order_number} · {fmtShortDate(o.delivery_date)}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <StatusBadge status={o.status} />
                  <ChevronRight className="w-4 h-4 text-ios-ink-sec" />
                </div>
              </Link>
            </li>
          ))
        )}
      </ul>

      <BottomNav />
    </div>
  );
}

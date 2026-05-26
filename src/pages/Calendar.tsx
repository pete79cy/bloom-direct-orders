import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useOrders, useCustomers } from '@/lib/queries';
import StatusBadge from '@/components/StatusBadge';
import BottomNav from '@/components/BottomNav';
import { cn } from '@/lib/cn';
import type { Order, OrderStatus } from '@/types';

const DAY_LABELS = ['Δ', 'Τ', 'Τ', 'Π', 'Π', 'Σ', 'Κ'];

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}
function isoFromDate(d: Date): string {
  // Local YYYY-MM-DD (avoid timezone shift from toISOString())
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function monthLabel(d: Date): string {
  return d.toLocaleDateString('el-GR', { month: 'long', year: 'numeric' });
}

const HIDDEN: OrderStatus[] = ['DELIVERED', 'CANCELLED', 'INVOICED'];

function dayColor(orders: Order[]): string {
  if (orders.length === 0) return '';
  if (orders.some((o) => o.status === 'PENDING')) return 'bg-orange-500';
  if (orders.every((o) => o.status === 'DELIVERED' || o.status === 'INVOICED')) return 'bg-green-500';
  return 'bg-blue-500';
}

export default function Calendar() {
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const [showAll, setShowAll] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const { data: orders = [] } = useOrders();
  const { data: customers = [] } = useCustomers();

  const customerLabel = (id: string) => {
    const c = customers.find((x) => x.id === id);
    return c?.trading_name || c?.legal_name || 'Άγνωστος πελάτης';
  };

  const byDay = useMemo(() => {
    const m = new Map<string, Order[]>();
    for (const o of orders) {
      if (!o.delivery_date) continue;
      if (!showAll && HIDDEN.includes(o.status)) continue;
      const list = m.get(o.delivery_date) ?? [];
      list.push(o);
      m.set(o.delivery_date, list);
    }
    return m;
  }, [orders, showAll]);

  const grid = useMemo(() => {
    const first = startOfMonth(cursor);
    const last = endOfMonth(cursor);
    const leadingBlanks = (first.getDay() + 6) % 7;
    const cells: { date: Date | null }[] = [];
    for (let i = 0; i < leadingBlanks; i++) cells.push({ date: null });
    for (let d = 1; d <= last.getDate(); d++) {
      cells.push({ date: new Date(cursor.getFullYear(), cursor.getMonth(), d) });
    }
    while (cells.length % 7 !== 0) cells.push({ date: null });
    return cells;
  }, [cursor]);

  const selectedOrders = selectedDay ? byDay.get(selectedDay) ?? [] : [];

  return (
    <div className="min-h-screen pb-24">
      <header className="px-4 pt-safe pt-4 pb-2 flex items-center justify-between">
        <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} aria-label="Προηγούμενος">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-semibold capitalize">{monthLabel(cursor)}</h1>
        <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} aria-label="Επόμενος">
          <ChevronRight className="w-5 h-5" />
        </button>
      </header>

      <div className="px-4 mt-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setCursor(startOfMonth(new Date()))}
          className="text-sm text-ios-tint"
        >
          Σήμερα
        </button>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={showAll}
            onChange={(e) => setShowAll(e.target.checked)}
          />
          Όλες
        </label>
      </div>

      <div className="px-4 mt-3 grid grid-cols-7 gap-1 text-center text-xs text-ios-ink-sec">
        {DAY_LABELS.map((l, i) => (
          <div key={i}>{l}</div>
        ))}
      </div>

      <div className="px-4 mt-1 grid grid-cols-7 gap-1">
        {grid.map((cell, i) => {
          if (!cell.date) return <div key={i} className="aspect-square" />;
          const iso = isoFromDate(cell.date);
          const dayOrders = byDay.get(iso) ?? [];
          const isToday = iso === isoFromDate(new Date());
          return (
            <button
              key={i}
              type="button"
              onClick={() => setSelectedDay(iso)}
              className={cn(
                'aspect-square rounded-lg flex flex-col items-center justify-center text-sm relative',
                isToday ? 'bg-ios-tint text-white font-semibold' : 'bg-white',
              )}
            >
              <span>{cell.date.getDate()}</span>
              {dayOrders.length > 0 && (
                <span className={cn('absolute bottom-1 right-1 text-[10px] text-white rounded-full px-1 min-w-[14px] h-[14px] flex items-center justify-center', dayColor(dayOrders))}>
                  {dayOrders.length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {selectedDay && (
        <div
          className="fixed inset-0 bg-black/30 z-50 flex items-end"
          onClick={() => setSelectedDay(null)}
        >
          <div
            className="bg-white w-full rounded-t-2xl p-4 pb-safe max-h-[70vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-semibold text-lg mb-3">{selectedDay}</h3>
            {selectedOrders.length === 0 ? (
              <p className="text-ios-ink-sec">Καμία παράδοση.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {selectedOrders.map((o) => (
                  <li key={o.id}>
                    <Link
                      to={`/orders/${o.id}`}
                      className="flex items-center justify-between py-3"
                      onClick={() => setSelectedDay(null)}
                    >
                      <div className="min-w-0">
                        <p className="font-medium truncate">{customerLabel(o.customer_id)}</p>
                        <p className="text-xs text-ios-ink-sec">{o.order_number}</p>
                      </div>
                      <StatusBadge status={o.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  );
}

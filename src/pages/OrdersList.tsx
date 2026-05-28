import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search } from 'lucide-react';
import { useOrders, useCustomers } from '@/lib/queries';
import { fmtShortDate, isoToday, addDays } from '@/lib/format';
import StatusBadge from '@/components/StatusBadge';
import BottomNav from '@/components/BottomNav';
import type { OrderStatus } from '@/types';

const FILTER_DEFS: { id: 'ALL' | OrderStatus; label: string }[] = [
  { id: 'ALL', label: 'Ενεργές' },
  { id: 'PENDING', label: 'Εκκρεμείς' },
  { id: 'PREPARING', label: 'Ετοιμασία' },
  { id: 'READY', label: 'Έτοιμες' },
  { id: 'PARTIALLY_DELIVERED', label: 'Μερική' },
  { id: 'DELIVERED', label: 'Παραδομένες' },
  { id: 'INVOICED', label: 'Τιμολογημένες' },
  { id: 'CANCELLED', label: 'Ακυρωμένες' },
];

const HIDDEN_FROM_DEFAULT: OrderStatus[] = ['INVOICED', 'CANCELLED'];

export default function OrdersList() {
  const { data: orders = [] } = useOrders();
  const { data: customers = [] } = useCustomers();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'ALL' | OrderStatus>('ALL');
  // Optional delivery_date narrowing — set when the user lands here via
  // a tappable Home stat ("Σήμερα" / "Αύριο"). Null = no narrowing.
  const [deliveryDateFilter, setDeliveryDateFilter] = useState<string | null>(null);

  // Read URL query params on mount and translate them into initial filter
  // state. Home's stat tiles link here with ?status=PREPARING /
  // ?delivery=today / ?delivery=tomorrow. We clear the params after
  // consuming them so back-button navigation feels clean.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const status = searchParams.get('status');
    const delivery = searchParams.get('delivery');
    if (status && FILTER_DEFS.some((f) => f.id === status)) {
      setFilter(status as OrderStatus);
    }
    if (delivery === 'today') {
      setDeliveryDateFilter(isoToday());
    } else if (delivery === 'tomorrow') {
      setDeliveryDateFilter(addDays(isoToday(), 1));
    }
    if (status || delivery) {
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const customerLabel = (id: string) => {
    const c = customers.find((x) => x.id === id);
    return c?.trading_name || c?.legal_name || 'Άγνωστος πελάτης';
  };

  const counts = useMemo(() => {
    const out: Partial<Record<'ALL' | OrderStatus, number>> = {
      ALL: orders.filter((o) => !HIDDEN_FROM_DEFAULT.includes(o.status)).length,
    };
    for (const o of orders) out[o.status] = (out[o.status] ?? 0) + 1;
    return out;
  }, [orders]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((o) => {
      if (filter === 'ALL' && HIDDEN_FROM_DEFAULT.includes(o.status)) return false;
      if (filter !== 'ALL' && o.status !== filter) return false;
      // Delivery-date narrowing from URL param (Σήμερα / Αύριο deep-links).
      if (deliveryDateFilter && o.delivery_date !== deliveryDateFilter) return false;
      if (!q) return true;
      const label = customerLabel(o.customer_id).toLowerCase();
      return label.includes(q) || o.order_number.toLowerCase().includes(q);
    });
  }, [orders, customers, filter, search, deliveryDateFilter]);

  const today = new Date().toLocaleDateString('el-GR', { day: 'numeric', month: 'long' });
  const activeCount = counts.ALL ?? 0;

  return (
    <div className="min-h-screen pb-24">
      <header className="pt-safe" style={{ padding: '14px 20px 0' }}>
        <div className="text-eyebrow">
          {today} · {activeCount} ενεργές
        </div>
        <h1
          className="font-display"
          style={{ fontSize: 30, lineHeight: 1.05, marginTop: 4, fontWeight: 500 }}
        >
          Παραγγελίες
        </h1>
      </header>

      {/* Active delivery-date narrowing banner — shows when the user landed
          here via a Home stat tile (Σήμερα / Αύριο). A small × clears it. */}
      {deliveryDateFilter && (
        <div style={{ padding: '12px 20px 0' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 12px',
              background: 'var(--sage-100)',
              color: 'var(--sage-800)',
              borderRadius: 10,
              fontSize: 13,
            }}
          >
            <span>
              Φιλτράρισμα: παράδοση {deliveryDateFilter === isoToday() ? 'σήμερα' : 'αύριο'}
            </span>
            <button
              type="button"
              onClick={() => setDeliveryDateFilter(null)}
              aria-label="Καθαρισμός φίλτρου"
              style={{
                width: 24, height: 24, borderRadius: 999,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                background: 'transparent',
                color: 'var(--sage-800)',
                fontWeight: 600,
              }}
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Search */}
      <div style={{ padding: '18px 20px 0', position: 'relative' }}>
        <Search
          className="absolute pointer-events-none"
          style={{ left: 32, top: 32, color: 'var(--ink-500)' }}
          size={16}
        />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Αναζήτηση πελάτη ή αριθμού"
          style={{
            width: '100%',
            height: 44,
            paddingLeft: 40,
            paddingRight: 14,
            background: 'rgba(255,255,255,0.85)',
            border: '1px solid rgba(63,75,70,0.08)',
            borderRadius: 12,
            fontSize: 15,
            outline: 'none',
          }}
        />
      </div>

      {/* Filter chips with monospace counts.
          .chip-strip wrapper renders a right-edge gradient fade so the user
          can see there are more filters off-screen (otherwise hidden chips
          like Τιμολογημένες / Ακυρωμένες are visually clipped without any
          affordance to scroll). */}
      <div className="chip-strip" style={{ padding: '14px 0 0' }}>
        <div
          style={{
            display: 'flex',
            gap: 8,
            padding: '0 20px',
            overflowX: 'auto',
            flexWrap: 'nowrap',
            scrollbarWidth: 'none',
          }}
        >
          {FILTER_DEFS.map((f) => {
            const count = counts[f.id] ?? 0;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={`chip ${filter === f.id ? 'chip-active' : ''}`}
              >
                {f.label}
                {count > 0 && (
                  <span className="font-mono-meta" style={{ fontSize: 10, opacity: 0.7 }}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* List */}
      <section style={{ padding: '18px 20px 0' }}>
        <div className="folio" style={{ marginBottom: 10 }}>
          <span className="folio-num">{String(filtered.length).padStart(2, '0')}</span>
          <span>αποτελέσματα</span>
        </div>
        {filtered.length === 0 ? (
          <p className="text-center text-ink-500 py-8 text-sm">Καμία παραγγελία</p>
        ) : (
          <div
            style={{
              background: '#fff',
              borderRadius: 16,
              boxShadow: 'var(--shadow-card)',
              overflow: 'hidden',
            }}
          >
            {filtered.map((o, i) => (
              <Link key={o.id} to={`/orders/${o.id}`}>
                {i > 0 && <div className="hairline" style={{ margin: '0 16px' }} />}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '14px 16px',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p
                      style={{
                        fontWeight: 500,
                        fontSize: 15,
                        color: 'var(--ink-900)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {customerLabel(o.customer_id)}
                    </p>
                    <p
                      className="font-mono-meta"
                      style={{
                        fontSize: 11,
                        color: 'var(--ink-500)',
                        marginTop: 3,
                        letterSpacing: '0.02em',
                      }}
                    >
                      {o.order_number} · {fmtShortDate(o.delivery_date)}
                    </p>
                  </div>
                  <StatusBadge status={o.status} />
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <BottomNav />
    </div>
  );
}

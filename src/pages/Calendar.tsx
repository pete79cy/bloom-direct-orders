import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, ChevronRight as ChevronRightSmall, Sun } from 'lucide-react';
import { useOrders, useCustomers } from '@/lib/queries';
import BottomNav from '@/components/BottomNav';
import StatusBadge from '@/components/StatusBadge';
import type { Order, OrderStatus } from '@/types';

/** Statuses considered "closed" — hidden by default since they don't
 *  represent work in front of us. Toggle "Όλες" surfaces them again. */
const HIDDEN: OrderStatus[] = ['DELIVERED', 'CANCELLED', 'INVOICED'];

/** Greek day names — abbreviated, all 3 chars so the badge column has
 *  consistent width. Index follows JS Date.getDay() (0=Sunday). */
const DAY_ABBR = ['Κυρ', 'Δευ', 'Τρί', 'Τετ', 'Πέμ', 'Παρ', 'Σάβ'];

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

/** Pill colour for the vertical accent on a day card. The signal we want
 *  is "what's the most urgent thing in this day?" — anything PENDING beats
 *  anything else, then anything in motion, then closed. */
function dayAccentVar(orders: Order[]): string {
  if (orders.some((o) => o.status === 'PENDING')) return 'var(--clay, #B85C38)';
  if (orders.some((o) => o.status === 'CANCELLED')) return 'var(--ink-300, #cbd0c8)';
  if (orders.every((o) => o.status === 'DELIVERED' || o.status === 'INVOICED')) {
    return 'var(--sage-500, #4E7549)';
  }
  return 'var(--sage-700)';
}

export default function Calendar() {
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const [showAll, setShowAll] = useState(false);
  const { data: orders = [] } = useOrders();
  const { data: customers = [] } = useCustomers();

  const todayISO = isoFromDate(new Date());

  const customerLabel = (id: string) => {
    const c = customers.find((x) => x.id === id);
    return c?.trading_name || c?.legal_name || 'Άγνωστος πελάτης';
  };

  // Group orders by delivery_date (only within the current month, only
  // active by default). We pre-sort each day's orders by status urgency
  // so the most "needs attention" shows first.
  const byDay = useMemo(() => {
    const m = new Map<string, Order[]>();
    const monthStart = isoFromDate(startOfMonth(cursor));
    const monthEnd = isoFromDate(endOfMonth(cursor));
    for (const o of orders) {
      if (!o.delivery_date) continue;
      if (o.delivery_date < monthStart || o.delivery_date > monthEnd) continue;
      if (!showAll && HIDDEN.includes(o.status)) continue;
      const list = m.get(o.delivery_date) ?? [];
      list.push(o);
      m.set(o.delivery_date, list);
    }
    // Sort each day's lines by status urgency (PENDING > PREPARING > READY > ...)
    const rank: Record<OrderStatus, number> = {
      PENDING: 0, PREPARING: 1, READY: 2, PARTIALLY_DELIVERED: 3,
      DELIVERED: 4, INVOICED: 5, CANCELLED: 6,
    };
    for (const [, list] of m) {
      list.sort((a, b) => rank[a.status] - rank[b.status]);
    }
    return m;
  }, [orders, showAll, cursor]);

  // Build the ordered list of (date, orders) tuples for this month.
  // Only days that have at least one (filtered) order show up — empty
  // days would just dilute the agenda in outdoor use.
  const days = useMemo(() => {
    const last = endOfMonth(cursor);
    const list: { iso: string; date: Date; orders: Order[] }[] = [];
    for (let d = 1; d <= last.getDate(); d++) {
      const date = new Date(cursor.getFullYear(), cursor.getMonth(), d);
      const iso = isoFromDate(date);
      const dayOrders = byDay.get(iso);
      if (dayOrders && dayOrders.length > 0) {
        list.push({ iso, date, orders: dayOrders });
      }
    }
    return list;
  }, [cursor, byDay]);

  const totalOrdersInMonth = useMemo(
    () => days.reduce((s, d) => s + d.orders.length, 0),
    [days],
  );

  // Auto-scroll to today when the month is the current one. Saves a
  // scroll for the most common outdoor case ("what do I have today?").
  const todayRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (todayRef.current) {
      todayRef.current.scrollIntoView({ block: 'start', behavior: 'auto' });
    }
  }, [cursor, days]);

  const isThisMonth =
    cursor.getFullYear() === new Date().getFullYear() &&
    cursor.getMonth() === new Date().getMonth();

  return (
    <div className="min-h-screen pb-24" style={{ background: 'var(--cream-100)' }}>
      {/* Top bar: month nav + jump-to-today */}
      <header
        className="pt-safe"
        style={{ padding: '14px 20px 8px' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h1
            className="font-display"
            style={{
              fontSize: 26,
              fontStyle: 'italic',
              fontWeight: 500,
              lineHeight: 1.1,
              color: 'var(--ink-900)',
              textTransform: 'capitalize',
              margin: 0,
            }}
          >
            {monthLabel(cursor)}
          </h1>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
              aria-label="Προηγούμενος μήνας"
              className="ios-tap"
              style={{
                width: 44, height: 44, borderRadius: 999, border: 0,
                background: '#fff', color: 'var(--sage-800)',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: 'var(--shadow-card)',
                cursor: 'pointer',
              }}
            >
              <ChevronLeft size={22} />
            </button>
            <button
              type="button"
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
              aria-label="Επόμενος μήνας"
              className="ios-tap"
              style={{
                width: 44, height: 44, borderRadius: 999, border: 0,
                background: '#fff', color: 'var(--sage-800)',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: 'var(--shadow-card)',
                cursor: 'pointer',
              }}
            >
              <ChevronRight size={22} />
            </button>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: 10,
            gap: 10,
          }}
        >
          <button
            type="button"
            onClick={() => setCursor(startOfMonth(new Date()))}
            disabled={isThisMonth}
            className="ios-tap"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              height: 36, padding: '0 14px',
              borderRadius: 999, border: 0,
              background: isThisMonth ? 'var(--cream-200)' : 'var(--sage-700)',
              color: isThisMonth ? 'var(--ink-500)' : 'var(--cream-50)',
              fontSize: 14, fontWeight: 600,
              cursor: isThisMonth ? 'default' : 'pointer',
            }}
          >
            <Sun size={14} strokeWidth={2.2} />
            Σήμερα
          </button>

          {/* "Όλες" toggle — surfaces delivered/invoiced/cancelled too */}
          <label
            className="ios-tap"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              height: 36, padding: '0 12px',
              borderRadius: 999,
              background: showAll ? 'var(--sage-100, #E6EEE2)' : '#fff',
              color: showAll ? 'var(--sage-800)' : 'var(--ink-700)',
              fontSize: 13, fontWeight: 600,
              boxShadow: 'var(--shadow-card)',
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={showAll}
              onChange={(e) => setShowAll(e.target.checked)}
              style={{ width: 16, height: 16, accentColor: 'var(--sage-700)' }}
            />
            Όλες
          </label>
        </div>

        {/* Tiny month summary — # παραδόσεις, # παραγγελίες — so you can
            sanity-check whether the toggle is hiding what you expect. */}
        <div
          className="font-mono-meta"
          style={{
            fontSize: 11,
            color: 'var(--ink-500)',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            marginTop: 10,
          }}
        >
          {days.length} {days.length === 1 ? 'μέρα' : 'μέρες'} · {totalOrdersInMonth} {totalOrdersInMonth === 1 ? 'παραγγελία' : 'παραγγελίες'}
        </div>
      </header>

      {/* Agenda list — one card per day-with-orders */}
      <div style={{ padding: '14px 16px 0' }}>
        {days.length === 0 && (
          <div
            style={{
              background: '#fff',
              borderRadius: 16,
              boxShadow: 'var(--shadow-card)',
              padding: '32px 20px',
              textAlign: 'center',
              color: 'var(--ink-500)',
              fontSize: 15,
              lineHeight: 1.5,
            }}
          >
            <div style={{ fontSize: 17, color: 'var(--ink-700)', marginBottom: 6, fontWeight: 600 }}>
              Καμία παράδοση αυτόν τον μήνα
            </div>
            {!showAll
              ? 'Δοκίμασε το «Όλες» για να δεις παραδομένες / τιμολογημένες.'
              : 'Άλλαξε μήνα από τα βέλη πάνω.'}
          </div>
        )}

        {days.map(({ iso, date, orders: dayOrders }) => {
          const isToday = iso === todayISO;
          const accent = dayAccentVar(dayOrders);
          const dayNum = date.getDate();
          const dayName = DAY_ABBR[date.getDay()];
          return (
            <div
              key={iso}
              ref={isToday ? todayRef : undefined}
              style={{
                background: '#fff',
                borderRadius: 16,
                boxShadow: 'var(--shadow-card)',
                marginBottom: 12,
                overflow: 'hidden',
                position: 'relative',
                border: isToday ? '2px solid var(--sage-700)' : 'none',
              }}
            >
              {/* Vertical accent stripe on the left edge. Same colour as the
                  most urgent status, gives a glance-level signal in sunlight. */}
              <div
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  left: 0, top: 0, bottom: 0, width: 6,
                  background: accent,
                }}
              />

              {/* Day header — big date number, day name, count */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  padding: '14px 16px 12px 20px',
                  borderBottom: '1px solid rgba(63,75,70,0.08)',
                  background: isToday ? 'var(--sage-50, #F4F7F3)' : '#fff',
                }}
              >
                <div style={{ minWidth: 56 }}>
                  <div
                    className="font-display"
                    style={{
                      fontSize: 36,
                      fontStyle: 'italic',
                      fontWeight: 500,
                      lineHeight: 1,
                      color: isToday ? 'var(--sage-800)' : 'var(--ink-900)',
                    }}
                  >
                    {dayNum}
                  </div>
                  <div
                    className="font-mono-meta"
                    style={{
                      fontSize: 11,
                      color: 'var(--ink-500)',
                      letterSpacing: '0.10em',
                      textTransform: 'uppercase',
                      marginTop: 3,
                      fontWeight: 600,
                    }}
                  >
                    {dayName}
                  </div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {isToday && (
                    <div
                      className="font-mono-meta"
                      style={{
                        fontSize: 10,
                        letterSpacing: '0.14em',
                        color: 'var(--sage-700)',
                        fontWeight: 700,
                        marginBottom: 2,
                      }}
                    >
                      ΣΗΜΕΡΑ
                    </div>
                  )}
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 500,
                      color: 'var(--ink-700)',
                    }}
                  >
                    {dayOrders.length} {dayOrders.length === 1 ? 'παράδοση' : 'παραδόσεις'}
                  </div>
                </div>
              </div>

              {/* Orders for this day — full-width tap rows. Customer name
                  is the loudest element (this is the answer to "who do I
                  visit today?"), order number is mono-meta for context. */}
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {dayOrders.map((o, i) => (
                  <li
                    key={o.id}
                    style={{
                      borderTop: i === 0 ? 'none' : '1px solid rgba(63,75,70,0.06)',
                    }}
                  >
                    <Link
                      to={`/orders/${o.id}`}
                      className="ios-tap"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '14px 16px 14px 20px',
                        textDecoration: 'none',
                        color: 'inherit',
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 18,
                            fontWeight: 700,
                            color: 'var(--ink-900)',
                            lineHeight: 1.2,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {customerLabel(o.customer_id)}
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            marginTop: 5,
                          }}
                        >
                          <StatusBadge status={o.status} />
                          <span
                            className="font-mono-meta"
                            style={{
                              fontSize: 11,
                              color: 'var(--ink-500)',
                              letterSpacing: '0.04em',
                            }}
                          >
                            {o.order_number}
                          </span>
                        </div>
                      </div>
                      <ChevronRightSmall
                        size={20}
                        color="var(--ink-300, #c4cabe)"
                        strokeWidth={2}
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      <BottomNav />
    </div>
  );
}

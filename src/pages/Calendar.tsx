import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, ChevronRight as ChevronRightSmall, Sun, FileText } from 'lucide-react';
import { useDeliveries, type DeliveryRow } from '@/lib/queries';
import BottomNav from '@/components/BottomNav';
import StatusBadge from '@/components/StatusBadge';
import type { OrderStatus } from '@/types';

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

/** Pill colour for the vertical accent on a day card. */
function dayAccentVar(rows: DeliveryRow[]): string {
  if (rows.some((r) => r.status === 'PENDING')) return 'var(--clay, #B85C38)';
  if (rows.some((r) => r.status === 'CANCELLED')) return 'var(--ink-300, #cbd0c8)';
  if (rows.every((r) => r.status === 'DELIVERED' || r.status === 'INVOICED')) {
    return 'var(--sage-500, #4E7549)';
  }
  return 'var(--sage-700)';
}

export default function Calendar() {
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const [showAll, setShowAll] = useState(false);

  const from = isoFromDate(startOfMonth(cursor));
  const to = isoFromDate(endOfMonth(cursor));
  const { data: rows = [], isLoading } = useDeliveries(from, to);

  const todayISO = isoFromDate(new Date());

  // Apply the "Όλες" toggle: by default hide closed-state rows. Group
  // the remainder by date for the agenda. The server has already
  // collapsed (date, order) duplicates and sorted by urgency.
  const byDay = useMemo(() => {
    const m = new Map<string, DeliveryRow[]>();
    for (const r of rows) {
      if (!showAll && HIDDEN.includes(r.status)) continue;
      const list = m.get(r.date) ?? [];
      list.push(r);
      m.set(r.date, list);
    }
    return m;
  }, [rows, showAll]);

  // Ordered list of (date, rows) tuples for this month — only days that
  // have at least one matching row (empty days clutter the agenda).
  const days = useMemo(() => {
    const last = endOfMonth(cursor);
    const list: { iso: string; date: Date; rows: DeliveryRow[] }[] = [];
    for (let d = 1; d <= last.getDate(); d++) {
      const date = new Date(cursor.getFullYear(), cursor.getMonth(), d);
      const iso = isoFromDate(date);
      const dayRows = byDay.get(iso);
      if (dayRows && dayRows.length > 0) {
        list.push({ iso, date, rows: dayRows });
      }
    }
    return list;
  }, [cursor, byDay]);

  const totalRowsInMonth = useMemo(
    () => days.reduce((s, d) => s + d.rows.length, 0),
    [days],
  );

  // Auto-scroll to today when the month is the current one.
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
      <header className="pt-safe" style={{ padding: '14px 20px 8px' }}>
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
                boxShadow: 'var(--shadow-card)', cursor: 'pointer',
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
                boxShadow: 'var(--shadow-card)', cursor: 'pointer',
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

          <label
            className="ios-tap"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              height: 36, padding: '0 12px',
              borderRadius: 999,
              background: showAll ? 'var(--sage-100, #E6EEE2)' : '#fff',
              color: showAll ? 'var(--sage-800)' : 'var(--ink-700)',
              fontSize: 13, fontWeight: 600,
              boxShadow: 'var(--shadow-card)', cursor: 'pointer',
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
          {isLoading
            ? 'Φόρτωση…'
            : `${days.length} ${days.length === 1 ? 'μέρα' : 'μέρες'} · ${totalRowsInMonth} ${totalRowsInMonth === 1 ? 'παράδοση' : 'παραδόσεις'}`}
        </div>
      </header>

      <div style={{ padding: '14px 16px 0' }}>
        {!isLoading && days.length === 0 && (
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

        {days.map(({ iso, date, rows: dayRows }) => {
          const isToday = iso === todayISO;
          const accent = dayAccentVar(dayRows);
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
              <div
                aria-hidden="true"
                style={{
                  position: 'absolute', left: 0, top: 0, bottom: 0, width: 6,
                  background: accent,
                }}
              />

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
                  <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink-700)' }}>
                    {dayRows.length} {dayRows.length === 1 ? 'παράδοση' : 'παραδόσεις'}
                  </div>
                </div>
              </div>

              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {dayRows.map((r, i) => (
                  <li
                    key={`${r.order_id}::${r.dn_id ?? 'plan'}`}
                    style={{
                      borderTop: i === 0 ? 'none' : '1px solid rgba(63,75,70,0.06)',
                    }}
                  >
                    <Link
                      to={`/orders/${r.order_id}`}
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
                          {r.customer_name}
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            marginTop: 5,
                            flexWrap: 'wrap',
                          }}
                        >
                          <StatusBadge status={r.status} />
                          <span
                            className="font-mono-meta"
                            style={{
                              fontSize: 11,
                              color: 'var(--ink-500)',
                              letterSpacing: '0.04em',
                            }}
                          >
                            {r.order_number}
                          </span>
                          {/* DN chip — surfaces that this slot is backed by
                              a real delivery note (not just the planned
                              order date). The operator wants to know that
                              paperwork already exists for the run. */}
                          {(r.source === 'dn' || r.source === 'both') && r.dn_number && (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 3,
                                fontSize: 10,
                                fontWeight: 700,
                                letterSpacing: '0.05em',
                                padding: '2px 6px',
                                borderRadius: 4,
                                background: 'var(--sage-100, #E6EEE2)',
                                color: 'var(--sage-800)',
                              }}
                            >
                              <FileText size={10} strokeWidth={2.5} />
                              {r.dn_number}
                            </span>
                          )}
                        </div>
                      </div>
                      <ChevronRightSmall size={20} color="var(--ink-300, #c4cabe)" strokeWidth={2} />
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

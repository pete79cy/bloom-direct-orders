import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ChevronLeft,
  ChevronRight,
  ChevronRight as ChevronRightSmall,
  Sun,
  FileText,
  ArrowRight,
} from 'lucide-react';
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
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function monthLabel(d: Date): string {
  return d.toLocaleDateString('el-GR', { month: 'long', year: 'numeric' });
}
function monthShortLabel(d: Date): string {
  // "Ιουλ 2026" — compact for the empty-state suggestion chips.
  return d.toLocaleDateString('el-GR', { month: 'short', year: 'numeric' });
}
function sameYearMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

function dayAccentVar(rows: DeliveryRow[]): string {
  if (rows.some((r) => r.status === 'PENDING')) return 'var(--clay, #B85C38)';
  if (rows.some((r) => r.status === 'CANCELLED')) return 'var(--ink-300, #cbd0c8)';
  if (rows.every((r) => r.status === 'DELIVERED' || r.status === 'INVOICED')) {
    return 'var(--sage-500, #4E7549)';
  }
  return 'var(--sage-700)';
}

/** A "month with deliveries" suggestion shown in the empty state — both
 *  the Date (for navigation) and a count (for the chip label). */
interface MonthSuggestion { date: Date; count: number }

export default function Calendar() {
  const today = new Date();
  const [cursor, setCursor] = useState(() => startOfMonth(today));
  const [showAll, setShowAll] = useState(false);

  // Wide STATIC window anchored to today (NOT to the cursor). The user
  // reported tapping a month-suggestion chip and seeing nothing change
  // — root cause: the cursor-anchored window changed the query key on
  // every navigation, kicking off a fresh fetch each time. While the
  // new fetch was in flight, `rows` defaulted to [] which re-rendered
  // the same empty state the user was trying to escape (just with a
  // different chip set milliseconds later).
  //
  // A 24-month static window (-12 to +12 months) covers the realistic
  // small-business horizon in a single request and lets cursor changes
  // be instant client-side filters. React Query caches the (from, to)
  // pair across the whole session — zero refetches on month changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fetchFrom = useMemo(() => isoFromDate(new Date(today.getFullYear(), today.getMonth() - 12, 1)), []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fetchTo = useMemo(() => isoFromDate(new Date(today.getFullYear(), today.getMonth() + 13, 0)), []);
  const { data: rows = [], isLoading, isError } = useDeliveries(fetchFrom, fetchTo);

  const todayISO = isoFromDate(today);

  // Group all (filtered) rows by ISO date. The "Όλες" toggle decides
  // whether closed-state rows show up at all.
  //
  // NORMALISATION: the server returns delivery_date through pg's default
  // DATE → JS Date → JSON.stringify path, which emits a full ISO
  // timestamp like "2026-04-15T00:00:00.000Z". Our day-cell lookups
  // generate "2026-04-15" via isoFromDate, so the .get() lookup misses
  // every time and `days` stays empty regardless of cursor / chip taps.
  // Slice to the first 10 chars (YYYY-MM-DD) so both producer and
  // consumer agree on the key shape.
  const byDay = useMemo(() => {
    const m = new Map<string, DeliveryRow[]>();
    for (const r of rows) {
      if (!showAll && HIDDEN.includes(r.status)) continue;
      const dayKey = String(r.date).slice(0, 10);
      const list = m.get(dayKey) ?? [];
      list.push(r);
      m.set(dayKey, list);
    }
    return m;
  }, [rows, showAll]);

  // How many rows in the current cursor month would be visible if we
  // toggled "Όλες" on? Used to nudge the operator when the month looks
  // empty only because closed-state DNs are being filtered out.
  // Same date-normalisation as byDay above — slice to YYYY-MM-DD.
  const hiddenInMonth = useMemo(() => {
    if (showAll) return 0;
    const monthStart = isoFromDate(startOfMonth(cursor));
    const monthEnd = isoFromDate(endOfMonth(cursor));
    let n = 0;
    for (const r of rows) {
      const day = String(r.date).slice(0, 10);
      if (day >= monthStart && day <= monthEnd && HIDDEN.includes(r.status)) n++;
    }
    return n;
  }, [rows, showAll, cursor]);

  // Days inside the current cursor month that have at least one row.
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

  // Months in the prefetched window that have at least one row, with
  // counts. Used by the empty-state to give the operator a one-tap jump
  // to the next month that actually has work.
  const monthSuggestions = useMemo<MonthSuggestion[]>(() => {
    const map = new Map<string, { date: Date; count: number }>();
    for (const [iso, list] of byDay) {
      const [y, m] = iso.split('-').map(Number);
      const key = `${y}-${m}`;
      const cur = map.get(key);
      if (cur) cur.count += list.length;
      else map.set(key, { date: new Date(y, m - 1, 1), count: list.length });
    }
    return [...map.values()]
      .filter((s) => !sameYearMonth(s.date, cursor))
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [byDay, cursor]);

  const totalRowsInMonth = useMemo(
    () => days.reduce((s, d) => s + d.rows.length, 0),
    [days],
  );

  // Auto-scroll to today when the cursor month is the current one.
  const todayRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (todayRef.current) {
      todayRef.current.scrollIntoView({ block: 'start', behavior: 'auto' });
    }
  }, [cursor, days]);

  const isThisMonth = sameYearMonth(cursor, today);

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
            onClick={() => setCursor(startOfMonth(today))}
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
        {/* Error state — separate from "empty" so the operator can tell
            them apart at a glance. */}
        {isError && (
          <div
            style={{
              background: 'var(--cream-50, #FDFCF8)',
              border: '1px solid #f3c2c2',
              borderRadius: 16,
              padding: '20px',
              color: 'var(--clay, #B85C38)',
              fontSize: 14,
              lineHeight: 1.5,
              marginBottom: 12,
            }}
          >
            <strong>Αποτυχία φόρτωσης παραδόσεων.</strong>
            <br />
            Δοκίμασε pull-to-refresh ή ξανάνοιξε το app.
          </div>
        )}

        {!isLoading && !isError && days.length === 0 && (
          <div
            style={{
              background: '#fff',
              borderRadius: 16,
              boxShadow: 'var(--shadow-card)',
              padding: '28px 20px',
              color: 'var(--ink-500)',
              lineHeight: 1.5,
            }}
          >
            <div
              className="font-display"
              style={{
                fontSize: 20,
                fontStyle: 'italic',
                fontWeight: 500,
                color: 'var(--ink-900)',
                marginBottom: 8,
                lineHeight: 1.2,
              }}
            >
              Καμία παράδοση τον {monthLabel(cursor)}
            </div>

            {/* Most-actionable hint first: are there closed deliveries
                hiding in THIS month that "Όλες" would surface? Operators
                often want to look back at recently delivered runs. */}
            {hiddenInMonth > 0 && (
              <div
                style={{
                  marginBottom: 14,
                  padding: '12px 14px',
                  borderRadius: 12,
                  background: 'var(--cream-200, #F4F1E8)',
                  border: '1px solid rgba(63,75,70,0.10)',
                }}
              >
                <p style={{ fontSize: 14, color: 'var(--ink-700)', marginBottom: 8 }}>
                  <strong>{hiddenInMonth}</strong> παράδοση
                  {hiddenInMonth === 1 ? ' είναι κρυμμένη' : 'εις είναι κρυμμένες'} αυτόν τον μήνα
                  (παραδομένες / τιμολογημένες / ακυρωμένες).
                </p>
                <button
                  type="button"
                  onClick={() => setShowAll(true)}
                  className="ios-tap"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '8px 12px', borderRadius: 10, border: 0,
                    background: 'var(--sage-700)', color: 'var(--cream-50)',
                    fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  Δείξε τες
                  <ArrowRight size={13} strokeWidth={2.5} />
                </button>
              </div>
            )}

            {monthSuggestions.length > 0 ? (
              <>
                <p style={{ fontSize: 14, color: 'var(--ink-500)', marginBottom: 14 }}>
                  {hiddenInMonth > 0 ? 'Άλλοι μήνες με παραδόσεις:' : 'Έχεις παραδόσεις σε άλλους μήνες:'}
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {monthSuggestions.map((s) => (
                    <button
                      key={s.date.toISOString()}
                      type="button"
                      onClick={() => setCursor(s.date)}
                      className="ios-tap"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '10px 14px',
                        borderRadius: 12,
                        border: 0,
                        background: 'var(--sage-700)',
                        color: 'var(--cream-50)',
                        fontSize: 14,
                        fontWeight: 600,
                        cursor: 'pointer',
                        textTransform: 'capitalize',
                      }}
                    >
                      {monthShortLabel(s.date)}
                      <span
                        className="font-mono-meta"
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: '2px 6px',
                          borderRadius: 4,
                          background: 'rgba(255,255,255,0.20)',
                        }}
                      >
                        {s.count}
                      </span>
                      <ArrowRight size={14} strokeWidth={2.5} />
                    </button>
                  ))}
                </div>
              </>
            ) : (
              hiddenInMonth === 0 && (
                <p style={{ fontSize: 14, color: 'var(--ink-500)' }}>
                  {!showAll
                    ? 'Δοκίμασε το «Όλες» πάνω για να δεις παραδομένες/τιμολογημένες, ή τα βέλη για παλιότερους μήνες.'
                    : 'Δεν υπάρχουν προγραμματισμένες παραδόσεις σε ±6 μήνες από αυτόν.'}
                </p>
              )
            )}
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

      {/* Debug strip — visible build marker so we can immediately tell
          from a screenshot whether the device is on the latest bundle
          or still serving a cached older SW. Remove once the
          stale-PWA-cache problem is fully resolved. */}
      <div
        style={{
          padding: '12px 20px 4px',
          fontSize: 9,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'var(--ink-500)',
          fontFamily: 'monospace',
          lineHeight: 1.4,
        }}
      >
        build: cal-static-1774817 · today {todayISO} · range {fetchFrom}…{fetchTo}
        <br />
        rows: {isLoading ? 'loading' : isError ? 'ERROR' : rows.length} ·
        showAll: {String(showAll)} ·
        cursor: {isoFromDate(cursor)} ·
        days: {days.length}
      </div>

      <BottomNav />
    </div>
  );
}

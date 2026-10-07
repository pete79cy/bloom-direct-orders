import { Link, useNavigate } from 'react-router-dom';
import { Bell, Check, ChevronRight, FileText, Layers, Leaf, LogOut, ShoppingCart, UserPlus } from 'lucide-react';
import type { ReactNode } from 'react';
import { useOrders, useCustomers, useQuotes } from '@/lib/queries';
import { fmtShortDate, dayKey, localDayKey, addDays } from '@/lib/format';
import { compareQuotesNewestFirst, displayQuoteStatus } from '@/lib/quote';
import QuoteStatusBadge from '@/components/QuoteStatusBadge';
import { logout, getUser } from '@/lib/auth';
import StatusBadge from '@/components/StatusBadge';
import BottomNav from '@/components/BottomNav';
import { useReminders } from '@/hooks/useReminders';
import { useDueReminderNotifications } from '@/hooks/useDueReminderNotifications';
import { dismissReminder, fmtReminderWhen } from '@/lib/reminders';
import { toast } from 'sonner';

function idStamp(id: string): number {
  return Number(/\d{10,}/.exec(id)?.[0] ?? 0);
}

function todayHeader(): { day: string; date: string } {
  const d = new Date();
  const day = d.toLocaleDateString('el-GR', { weekday: 'long' });
  const date = d.toLocaleDateString('el-GR', { day: 'numeric', month: 'long' });
  return { day: day.charAt(0).toUpperCase() + day.slice(1), date };
}

export default function Home() {
  const navigate = useNavigate();
  const user = getUser();
  const { data: orders = [], isLoading: ordersLoading } = useOrders();
  const { data: quotes = [], isLoading: quotesLoading } = useQuotes();
  const isLoading = ordersLoading || quotesLoading;
  const { data: customers = [] } = useCustomers();
  const { due: dueReminders } = useReminders();
  useDueReminderNotifications();

  // Quote counters: open = DRAFT/SENT still valid; "λήγει" = SENT expiring
  // within 7 days. Dates via localDayKey — the list endpoint returns node-pg
  // Date timestamps (see lib/format.ts).
  const todayLocal = localDayKey(new Date().toISOString());
  const weekAhead = addDays(todayLocal, 7);
  const openQuotes = quotes.filter((q) => {
    const shown = displayQuoteStatus(q, todayLocal);
    return shown === 'DRAFT' || shown === 'SENT';
  });
  const expiringSoon = openQuotes.filter(
    (q) => q.status === 'SENT' && localDayKey(q.valid_until) <= weekAhead,
  ).length;

  // Recent = orders and quotes interleaved by creation, newest first.
  type RecentItem =
    | { kind: 'order'; id: string; at: string; o: (typeof orders)[number] }
    | { kind: 'quote'; id: string; at: string; q: (typeof quotes)[number] };
  const recent: RecentItem[] = [
    ...orders.slice(0, 8).map((o) => ({ kind: 'order' as const, id: o.id, at: o.created_at, o })),
    ...quotes.filter((q) => q.status !== 'SUPERSEDED').sort(compareQuotesNewestFirst).slice(0, 8)
      .map((q) => ({ kind: 'quote' as const, id: q.id, at: q.created_at, q })),
  ]
    // created_at is a DATE column, so break same-day ties with the epoch
    // embedded in the id ('o-<ms>' / 'q-<ms>-xxxx').
    .sort((a, b) => localDayKey(b.at).localeCompare(localDayKey(a.at)) || idStamp(b.id) - idStamp(a.id))
    .slice(0, 6);
  const todayISO = new Date().toISOString().slice(0, 10);
  const tomorrowDate = new Date(); tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrowISO = tomorrowDate.toISOString().slice(0, 10);
  const preparingNow = orders.filter((o) => o.status === 'PREPARING').length;
  // dayKey() normalises the server's "YYYY-MM-DDT00:00:00.000Z" timestamp
  // back to YYYY-MM-DD so the === comparison against todayISO actually
  // matches. Without it the counts are pinned at 0 forever — same root
  // cause that hid the calendar's day cards.
  const todayDeliveries = orders.filter((o) => dayKey(o.delivery_date) === todayISO).length;
  const tomorrowDeliveries = orders.filter((o) => dayKey(o.delivery_date) === tomorrowISO).length;

  const { day, date } = todayHeader();
  const firstName = (user?.name ?? user?.email ?? '').split(/[ @]/)[0];

  function customerLabel(id: string): string {
    const c = customers.find((x) => x.id === id);
    return c?.trading_name || c?.legal_name || 'Άγνωστος πελάτης';
  }

  function onLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="min-h-screen pb-24">
      <header
        className="pt-safe"
        style={{
          padding: '14px 20px 0',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
        }}
      >
        <div>
          <div className="text-eyebrow" style={{ marginBottom: 4 }}>
            {day} · {date}
          </div>
          <h1
            className="font-display"
            style={{ fontSize: 30, lineHeight: 1.05, color: 'var(--ink-900)', fontWeight: 500 }}
          >
            Καλώς ήρθες,{' '}
            <span style={{ fontStyle: 'italic', color: 'var(--sage-700)' }}>{firstName}</span>
          </h1>
        </div>
        <button
          type="button"
          onClick={onLogout}
          aria-label="Αποσύνδεση"
          className="ios-tap"
          style={{
            width: 38, height: 38, borderRadius: 999,
            background: 'rgba(63,75,70,0.06)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--ink-500)',
          }}
        >
          <LogOut size={16} />
        </button>
      </header>

      {/* The two ways in — quote above, order below. Quote is the calmer
          white card; order keeps the brand-filled CTA the app always had. */}
      <div style={{ padding: '20px 20px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <ModeCard
          to="/quotes/new"
          tone="light"
          icon={<FileText size={20} strokeWidth={1.9} />}
          title="Νέα Προσφορά"
          sub="Τιμές σε πελάτη, ισχύς και PDF"
          stats={[
            { n: openQuotes.length, label: 'ανοιχτές', to: '/quotes?status=OPEN' },
            { n: expiringSoon, label: 'λήγουν σε 7 ημ.', to: '/quotes?status=SENT', alert: expiringSoon > 0 },
          ]}
        />
        <ModeCard
          to="/orders/new"
          tone="brand"
          icon={<ShoppingCart size={20} strokeWidth={1.9} />}
          title="Νέα Παραγγελία"
          sub="Για ετοιμασία και παράδοση"
          stats={[
            { n: todayDeliveries, label: 'σήμερα', to: '/orders?delivery=today' },
            { n: preparingNow, label: 'ετοιμασία', to: '/orders?status=PREPARING' },
            { n: tomorrowDeliveries, label: 'αύριο', to: '/orders?delivery=tomorrow' },
          ]}
        />
      </div>

      {/* Secondary: add a customer, a catalogue product, or one more size of
          an existing product. The customer button is also the target of the
          iOS "Add to Bloom" Shortcut (deep-links here pre-filled). */}
      <div style={{ padding: '10px 20px 0', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        <QuickLink to="/customers/new" icon={<UserPlus size={20} strokeWidth={1.9} />} label="Νέος πελάτης" />
        <QuickLink to="/products/new" icon={<Leaf size={20} strokeWidth={1.9} />} label="Νέο προϊόν" />
        <QuickLink to="/products/new/size" icon={<Layers size={20} strokeWidth={1.9} />} label="Νέο υποπροϊόν" />
      </div>

      {/* Due reminders — device-local, set from order detail */}
      {dueReminders.length > 0 && (
        <section style={{ padding: '20px 20px 0' }}>
          <div className="folio" style={{ marginBottom: 10 }}>
            <span>Υπενθυμίσεις</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {dueReminders.map((r) => (
              <div
                key={r.id}
                style={{
                  background: '#fff',
                  borderRadius: 14,
                  boxShadow: 'var(--shadow-card)',
                  borderLeft: '3px solid var(--clay)',
                  padding: '12px 14px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                }}
              >
                <Bell size={16} color="var(--clay)" strokeWidth={1.9} style={{ marginTop: 2, flexShrink: 0 }} />
                <Link
                  to={`/orders/${r.orderId}`}
                  style={{ flex: 1, minWidth: 0, textDecoration: 'none', color: 'inherit' }}
                >
                  <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink-900)', margin: 0 }}>
                    {r.customerName || r.orderNumber}
                  </p>
                  <p
                    className="font-mono-meta"
                    style={{ fontSize: 11, color: 'var(--ink-500)', margin: '3px 0 0' }}
                  >
                    {r.orderNumber} · {fmtReminderWhen(r.remindAt)}
                  </p>
                  {r.body ? (
                    <p style={{ fontSize: 13, color: 'var(--ink-700)', margin: '6px 0 0', lineHeight: 1.4 }}>
                      {r.body}
                    </p>
                  ) : null}
                </Link>
                <button
                  type="button"
                  aria-label="Ολοκλήρωση υπενθύμισης"
                  className="ios-tap"
                  onClick={() => {
                    dismissReminder(r.id);
                    toast.success('Ολοκληρώθηκε');
                  }}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 999,
                    border: 'none',
                    background: 'rgba(74, 107, 90, 0.12)',
                    color: 'var(--sage-800)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Check size={16} strokeWidth={2.4} />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Recent — orders and quotes together */}
      <section style={{ padding: '28px 20px 0' }}>
        <div className="folio" style={{ marginBottom: 12 }}><span>Πρόσφατα</span></div>

        {isLoading ? (
          <p className="text-ink-500 text-sm">Φόρτωση…</p>
        ) : recent.length === 0 ? (
          <p className="text-ink-500 text-sm">Καμία παραγγελία ή προσφορά ακόμη.</p>
        ) : (
          <div style={{ background: '#fff', borderRadius: 16, boxShadow: 'var(--shadow-card)', overflow: 'hidden' }}>
            {recent.map((r, i) => {
              const isQuote = r.kind === 'quote';
              const to = isQuote ? `/quotes/${r.id}` : `/orders/${r.id}`;
              const customerId = isQuote ? r.q.customer_id : r.o.customer_id;
              const meta = isQuote
                ? `${r.q.quote_number} · έως ${fmtShortDate(r.q.valid_until)}`
                : `${r.o.order_number} · ${fmtShortDate(r.o.delivery_date)}`;
              return (
                <Link key={`${r.kind}-${r.id}`} to={to}>
                  {i > 0 && <div className="hairline" style={{ margin: '0 16px' }} />}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px' }}>
                    <span
                      aria-hidden
                      style={{
                        width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: isQuote ? 'var(--sage-100)' : 'rgba(63,75,70,0.06)',
                        color: isQuote ? 'var(--sage-700)' : 'var(--ink-500)',
                      }}
                    >
                      {isQuote ? <FileText size={14} /> : <ShoppingCart size={14} />}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontWeight: 500, fontSize: 15, color: 'var(--ink-900)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {customerLabel(customerId)}
                      </p>
                      <p className="font-mono-meta" style={{ fontSize: 11, color: 'var(--ink-500)', marginTop: 3, letterSpacing: '0.02em' }}>
                        {meta}
                      </p>
                    </div>
                    {isQuote ? (
                      <QuoteStatusBadge status={displayQuoteStatus(r.q, todayLocal)} hasOrder={!!r.q.linked_order_id} />
                    ) : (
                      <StatusBadge status={r.o.status} />
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <BottomNav />
    </div>
  );
}

interface ModeStat {
  n: number;
  label: string;
  to: string;
  alert?: boolean;
}

/**
 * One half of the home split: a large tappable card that starts the flow,
 * with its live counters underneath as their own deep links. The card and
 * the counters are siblings (never nested links).
 */
function ModeCard({
  to, tone, icon, title, sub, stats,
}: {
  to: string;
  tone: 'light' | 'brand';
  icon: ReactNode;
  title: string;
  sub: string;
  stats: ModeStat[];
}) {
  const brand = tone === 'brand';
  const fg = brand ? 'var(--cream-50)' : 'var(--ink-900)';
  const muted = brand ? 'rgba(253,252,248,0.72)' : 'var(--ink-500)';
  return (
    <div
      style={{
        borderRadius: 18,
        overflow: 'hidden',
        background: brand ? 'var(--sage-700)' : '#fff',
        border: brand ? 'none' : '1.5px solid var(--sage-200)',
        boxShadow: brand ? 'var(--shadow-cta)' : 'var(--shadow-card)',
      }}
    >
      <Link
        to={to}
        className="ios-tap"
        style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 16px 14px', color: fg, textDecoration: 'none' }}
      >
        <span
          style={{
            width: 44, height: 44, borderRadius: 13, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: brand ? 'rgba(255,255,255,0.14)' : 'var(--sage-100)',
            color: brand ? '#fff' : 'var(--sage-700)',
          }}
        >
          {icon}
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span className="font-display" style={{ display: 'block', fontSize: 23, fontWeight: 500, lineHeight: 1.05 }}>{title}</span>
          <span style={{ display: 'block', fontSize: 12.5, color: muted, marginTop: 4 }}>{sub}</span>
        </span>
        <span
          aria-hidden
          style={{
            width: 32, height: 32, borderRadius: 999, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: brand ? '#fff' : 'var(--sage-700)',
            color: brand ? 'var(--sage-700)' : '#fff',
          }}
        >
          <ChevronRight size={18} strokeWidth={2.4} />
        </span>
      </Link>
      <div
        style={{
          display: 'flex',
          borderTop: `1px solid ${brand ? 'rgba(255,255,255,0.14)' : 'rgba(63,75,70,0.08)'}`,
        }}
      >
        {stats.map((st, i) => (
          <Link
            key={st.label}
            to={st.to}
            className="ios-tap"
            style={{
              flex: 1, padding: '9px 12px', display: 'flex', alignItems: 'baseline', gap: 6,
              borderLeft: i > 0 ? `1px solid ${brand ? 'rgba(255,255,255,0.14)' : 'rgba(63,75,70,0.08)'}` : 'none',
              textDecoration: 'none',
            }}
          >
            <span
              className="font-mono-meta"
              style={{ fontSize: 15, fontWeight: 500, color: st.alert ? (brand ? '#F5D29B' : 'var(--honey)') : fg }}
            >
              {String(st.n).padStart(2, '0')}
            </span>
            <span style={{ fontSize: 11, color: muted, whiteSpace: 'nowrap' }}>{st.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

/** Icon-over-label tile for the secondary "add …" row. */
function QuickLink({ to, icon, label }: { to: string; icon: ReactNode; label: string }) {
  return (
    <Link
      to={to}
      className="ios-tap"
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6,
        minHeight: 68, padding: '10px 6px', borderRadius: 14,
        background: '#fff', border: '1px solid rgba(63,75,70,0.12)',
        color: 'var(--sage-800)', fontSize: 13, fontWeight: 500, lineHeight: 1.15, textAlign: 'center',
        textDecoration: 'none',
      }}
    >
      {icon}
      <span>{label}</span>
    </Link>
  );
}

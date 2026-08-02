import { Link, useNavigate } from 'react-router-dom';
import { Bell, Check, LogOut, Plus, UserPlus } from 'lucide-react';
import { useOrders, useCustomers } from '@/lib/queries';
import { fmtShortDate, dayKey } from '@/lib/format';
import { logout, getUser } from '@/lib/auth';
import StatusBadge from '@/components/StatusBadge';
import BottomNav from '@/components/BottomNav';
import { useReminders } from '@/hooks/useReminders';
import { useDueReminderNotifications } from '@/hooks/useDueReminderNotifications';
import { dismissReminder, fmtReminderWhen } from '@/lib/reminders';
import { toast } from 'sonner';

function todayHeader(): { day: string; date: string } {
  const d = new Date();
  const day = d.toLocaleDateString('el-GR', { weekday: 'long' });
  const date = d.toLocaleDateString('el-GR', { day: 'numeric', month: 'long' });
  return { day: day.charAt(0).toUpperCase() + day.slice(1), date };
}

export default function Home() {
  const navigate = useNavigate();
  const user = getUser();
  const { data: orders = [], isLoading } = useOrders();
  const { data: customers = [] } = useCustomers();
  const { due: dueReminders } = useReminders();
  useDueReminderNotifications();

  const recent = orders.slice(0, 5);
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

      {/* Stats card */}
      <div
        style={{
          margin: '20px 20px 0',
          background: '#fff',
          borderRadius: 16,
          boxShadow: 'var(--shadow-card)',
          padding: 18,
          display: 'flex',
          alignItems: 'stretch',
        }}
      >
        <StatCol num={todayDeliveries} label="Σήμερα" sub="παραδόσεις" to="/orders?delivery=today" />
        <div className="vhairline" style={{ margin: '0 8px' }} />
        <StatCol num={preparingNow} label="Ετοιμασία" sub="σε εξέλιξη" accent="var(--st-preparing)" to="/orders?status=PREPARING" />
        <div className="vhairline" style={{ margin: '0 8px' }} />
        <StatCol num={tomorrowDeliveries} label="Αύριο" sub="παραδόσεις" to="/orders?delivery=tomorrow" />
      </div>

      {/* New order CTA */}
      <div style={{ padding: '20px 20px 0' }}>
        <Link to="/orders/new" className="btn-primary ios-tap" style={{ height: 60, fontSize: 17 }}>
          <Plus size={20} color="var(--cream-50)" />
          Νέα Παραγγελία
        </Link>
      </div>

      {/* Secondary: add a customer directly (also the target of the iOS
          "Add to Bloom" Shortcut, which deep-links here pre-filled from a
          phone contact). */}
      <div style={{ padding: '10px 20px 0' }}>
        <Link
          to="/customers/new"
          className="ios-tap"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            height: 46, borderRadius: 14,
            background: '#fff', border: '1px solid rgba(63,75,70,0.12)',
            color: 'var(--sage-800)', fontSize: 15, fontWeight: 500,
            textDecoration: 'none',
          }}
        >
          <UserPlus size={18} strokeWidth={1.9} />
          Νέος πελάτης
        </Link>
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

      {/* Recent orders */}
      <section style={{ padding: '28px 20px 0' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            marginBottom: 12,
          }}
        >
          <div className="folio"><span>Πρόσφατες</span></div>
          <Link
            to="/orders"
            style={{ fontSize: 12, color: 'var(--sage-700)', fontWeight: 500 }}
          >
            Όλες →
          </Link>
        </div>

        {isLoading ? (
          <p className="text-ink-500 text-sm">Φόρτωση…</p>
        ) : recent.length === 0 ? (
          <p className="text-ink-500 text-sm">Καμία παραγγελία ακόμη.</p>
        ) : (
          <div
            style={{
              background: '#fff',
              borderRadius: 16,
              boxShadow: 'var(--shadow-card)',
              overflow: 'hidden',
            }}
          >
            {recent.map((o, i) => (
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

function StatCol({
  num,
  label,
  sub,
  accent,
  to,
}: {
  num: number;
  label: string;
  sub: string;
  accent?: string;
  /** Optional deep-link target. When set the whole column becomes a Link
   *  that navigates to a pre-filtered Orders view. The chevron is hidden
   *  on small numbers — the affordance comes from the `ios-tap` press
   *  animation + cursor:pointer. */
  to?: string;
}) {
  const inner = (
    <>
      <div
        className="font-mono-meta"
        style={{
          fontSize: 26,
          fontWeight: 500,
          lineHeight: 1,
          color: accent || 'var(--ink-900)',
          marginBottom: 8,
        }}
      >
        {String(num).padStart(2, '0')}
      </div>
      <div style={{ fontSize: 12, color: 'var(--ink-900)', fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: 11, color: 'var(--ink-500)', marginTop: 1 }}>{sub}</div>
    </>
  );

  if (to) {
    return (
      <Link to={to} className="ios-tap" style={{ flex: 1, padding: '0 4px', display: 'block' }}>
        {inner}
      </Link>
    );
  }
  return <div style={{ flex: 1, padding: '0 4px' }}>{inner}</div>;
}

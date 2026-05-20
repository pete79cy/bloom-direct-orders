import { Link, useNavigate } from 'react-router-dom';
import { Plus, LogOut, ChevronRight } from 'lucide-react';
import { useOrders, useCustomers } from '@/lib/queries';
import { fmtShortDate } from '@/lib/format';
import { logout, getUser } from '@/lib/auth';
import StatusBadge from '@/components/StatusBadge';
import BottomNav from '@/components/BottomNav';

export default function Home() {
  const navigate = useNavigate();
  const user = getUser();
  const { data: orders = [], isLoading } = useOrders();
  const { data: customers = [] } = useCustomers();

  const recent = orders.slice(0, 10);

  function customerLabel(id: string): string {
    const c = customers.find((x) => x.id === id);
    return c?.trading_name || c?.legal_name || 'Άγνωστος πελάτης';
  }

  function onLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="min-h-full pb-24">
      <header className="px-4 pt-safe pt-4 pb-2 flex items-center justify-between">
        <div>
          <p className="text-sm text-ios-ink-sec">Καλώς ήρθες</p>
          <h1 className="text-2xl font-semibold">{user?.name ?? user?.email}</h1>
        </div>
        <button
          type="button"
          onClick={onLogout}
          aria-label="Αποσύνδεση"
          className="p-2 -m-2 text-ios-ink-sec"
        >
          <LogOut className="w-5 h-5" />
        </button>
      </header>

      <div className="px-4 mt-4">
        <Link
          to="/orders/new"
          className="flex items-center justify-center gap-2 w-full h-14 rounded-xl bg-ios-green text-white text-lg font-medium"
        >
          <Plus className="w-6 h-6" />
          Νέα Παραγγελία
        </Link>
      </div>

      <section className="px-4 mt-6">
        <h2 className="text-sm font-medium text-ios-ink-sec uppercase tracking-wide mb-2">
          Πρόσφατες παραγγελίες
        </h2>
        {isLoading ? (
          <p className="text-ios-ink-sec text-sm">Φόρτωση…</p>
        ) : recent.length === 0 ? (
          <p className="text-ios-ink-sec text-sm">Καμία παραγγελία ακόμη.</p>
        ) : (
          <ul className="bg-white rounded-xl divide-y divide-gray-100">
            {recent.map((o) => (
              <li key={o.id}>
                <Link
                  to={`/orders/${o.id}`}
                  className="flex items-center justify-between px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="font-medium truncate">{customerLabel(o.customer_id)}</p>
                    <p className="text-xs text-ios-ink-sec">
                      {o.order_number} · παράδοση {fmtShortDate(o.delivery_date)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <StatusBadge status={o.status} />
                    <ChevronRight className="w-4 h-4 text-ios-ink-sec" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <BottomNav />
    </div>
  );
}

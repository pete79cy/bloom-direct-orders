import { NavLink } from 'react-router-dom';
import { Home, ListOrdered, Calendar as CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

const tabs = [
  { to: '/', label: 'Αρχική', Icon: Home },
  { to: '/orders', label: 'Παραγγελίες', Icon: ListOrdered },
  { to: '/calendar', label: 'Ημερολόγιο', Icon: CalendarIcon },
];

export default function BottomNav() {
  return (
    <nav className="fixed bottom-0 inset-x-0 bg-white border-t border-gray-200 pb-safe z-40">
      <ul className="flex">
        {tabs.map(({ to, label, Icon }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center justify-center py-2 gap-0.5 text-xs',
                  isActive ? 'text-ios-tint' : 'text-ios-ink-sec',
                )
              }
            >
              <Icon className="w-6 h-6" />
              <span>{label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

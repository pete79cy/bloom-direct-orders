import { NavLink } from 'react-router-dom';
import { Home, ListOrdered, Calendar as CalendarIcon } from 'lucide-react';

const tabs = [
  { to: '/', label: 'Αρχική', Icon: Home },
  { to: '/orders', label: 'Παραγγελίες', Icon: ListOrdered },
  { to: '/calendar', label: 'Ημερολόγιο', Icon: CalendarIcon },
];

/**
 * Tab bar pinned to the bottom of the viewport across the whole app.
 *
 * NOTE: position is set via inline style (not the Tailwind `fixed` class).
 * On iOS PWA standalone, the Tailwind-driven version started detaching
 * from the bottom edge and scrolling with the page content. Cause is
 * not fully clear (no ancestor transform/filter that should create a
 * containing block, no overflow-clip), but the inline `position:fixed`
 * + safe-area padding consistently sticks. Keep this nav as inline-only
 * styling — don't refactor back to utility classes without first
 * verifying on an installed iPhone PWA.
 */
export default function BottomNav() {
  return (
    <nav
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        background: '#fff',
        borderTop: '1px solid rgba(63,75,70,0.10)',
        zIndex: 40,
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        // translateZ(0) promotes this nav to its own compositor layer.
        // Empirically this nudges iOS Safari into honouring the fixed
        // positioning under standalone-mode elastic scrolling, where a
        // plain position:fixed can momentarily drift with the content.
        transform: 'translateZ(0)',
        WebkitBackfaceVisibility: 'hidden',
      }}
    >
      <ul style={{ display: 'flex', listStyle: 'none', margin: 0, padding: 0 }}>
        {tabs.map(({ to, label, Icon }) => (
          <li key={to} style={{ flex: 1 }}>
            <NavLink
              to={to}
              end={to === '/'}
              style={({ isActive }) => ({
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2,
                padding: '8px 4px 6px',
                fontSize: 11,
                fontWeight: 600,
                textDecoration: 'none',
                color: isActive ? 'var(--sage-700)' : 'var(--ink-500)',
                minHeight: 48,
              })}
            >
              <Icon size={22} strokeWidth={1.8} />
              <span>{label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

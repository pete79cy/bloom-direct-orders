import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Bottom modal sheet — iOS-native feel.
 *
 * Animation uses the data-state pattern (Radix-style) so BOTH enter and
 * exit play. The component stays mounted for the exit duration, then
 * unmounts. Transitions can be retargeted mid-animation if the user
 * opens/closes rapidly — keyframes can't.
 *
 * - Sheet panel: 320ms transform with the iOS drawer curve
 * - Backdrop: 200ms opacity, ease-out
 * - Click on backdrop or Escape closes
 * - Body scroll is locked while open; scrollbar gap compensated on
 *   desktop so the page doesn't jump
 */
export function MobileSheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}) {
  const [shouldRender, setShouldRender] = useState(open);
  const [animState, setAnimState] = useState<'open' | 'closed'>(open ? 'open' : 'closed');
  const exitTimeout = useRef<number | null>(null);

  // Drive mount + animState lifecycle from `open`
  useEffect(() => {
    if (open) {
      // Cancel any pending unmount
      if (exitTimeout.current) {
        window.clearTimeout(exitTimeout.current);
        exitTimeout.current = null;
      }
      setShouldRender(true);
      setAnimState('closed');
      // Two rAF tick: paint with closed transform first, then flip — gives
      // the browser a real "from" state to transition from.
      const r1 = requestAnimationFrame(() => {
        const r2 = requestAnimationFrame(() => setAnimState('open'));
        return () => cancelAnimationFrame(r2);
      });
      return () => cancelAnimationFrame(r1);
    } else {
      setAnimState('closed');
      // Match the longest transition (sheet panel = 320ms) before unmount
      exitTimeout.current = window.setTimeout(() => {
        setShouldRender(false);
        exitTimeout.current = null;
      }, 320);
      return () => {
        if (exitTimeout.current) {
          window.clearTimeout(exitTimeout.current);
          exitTimeout.current = null;
        }
      };
    }
  }, [open]);

  // Escape + body scroll-lock (only while shouldRender so the lock applies during exit too)
  useEffect(() => {
    if (!shouldRender) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    // Compensate for the scrollbar disappearing on desktop, so the page
    // doesn't jump 15px to the right when the lock kicks in.
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    const prevOverflow = document.body.style.overflow;
    const prevPadding = document.body.style.paddingRight;
    document.body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPadding;
    };
  }, [shouldRender, onClose]);

  if (!shouldRender || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="ios-shell"
      data-state={animState}
      // pointer-events follow animState so a closed-but-not-yet-unmounted sheet
      // can't swallow clicks intended for the page underneath
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1200,
        pointerEvents: animState === 'open' ? 'auto' : 'none',
      }}
    >
      <div
        className="ios-sheet-backdrop"
        data-state={animState}
        aria-hidden="true"
        onClick={onClose}
        style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', cursor: 'pointer' }}
      />
      <div
        className="ios-sheet"
        data-state={animState}
        role="dialog"
        aria-modal="true"
        aria-label={title || 'Sheet'}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          background: 'var(--ios-bg-elev)',
          borderTopLeftRadius: 14,
          borderTopRightRadius: 14,
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          paddingBottom: `env(safe-area-inset-bottom, 0px)`,
        }}
      >
        <div
          aria-hidden="true"
          style={{
            width: 36,
            height: 5,
            borderRadius: 3,
            background: 'var(--ios-ink-quad)',
            margin: '6px auto 4px',
          }}
        />
        {title && (
          <div
            style={{
              textAlign: 'center',
              fontSize: 16,
              fontWeight: 600,
              padding: '6px 16px 12px',
              borderBottom: '0.5px solid var(--ios-separator)',
            }}
          >
            {title}
          </div>
        )}
        <div style={{ flex: 1, overflowY: 'auto' }}>{children}</div>
      </div>
    </div>,
    document.body,
  );
}

export default MobileSheet;

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Full-screen modal — used when the on-screen keyboard would otherwise
 * obscure a bottom sheet's content. Slides up from the bottom but covers
 * the entire viewport, so the keyboard naturally sits underneath the
 * content area without any of the visualViewport gymnastics required for
 * a half-height sheet.
 *
 * Pattern from the Bloom Orders mobile redesign (chat directive):
 *   "στο Βήμα 3 να καλύπτεται όλη η οθόνη από την προσθήκη φυτού,
 *    καθώς θα καλύπτεται από το πληκτρολόγιο"
 */
export function FullScreenSheet({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const [shouldRender, setShouldRender] = useState(open);
  const [animState, setAnimState] = useState<'open' | 'closed'>(open ? 'open' : 'closed');
  const exitTimeout = useRef<number | null>(null);

  useEffect(() => {
    if (open) {
      if (exitTimeout.current) {
        window.clearTimeout(exitTimeout.current);
        exitTimeout.current = null;
      }
      setShouldRender(true);
      setAnimState('closed');
      const r1 = requestAnimationFrame(() => {
        const r2 = requestAnimationFrame(() => setAnimState('open'));
        return () => cancelAnimationFrame(r2);
      });
      return () => cancelAnimationFrame(r1);
    } else {
      setAnimState('closed');
      exitTimeout.current = window.setTimeout(() => {
        setShouldRender(false);
        exitTimeout.current = null;
      }, 280);
      return () => {
        if (exitTimeout.current) {
          window.clearTimeout(exitTimeout.current);
          exitTimeout.current = null;
        }
      };
    }
  }, [open]);

  // Escape-to-close, no body lock.
  //
  // The full-screen modal covers the entire viewport at zIndex 1300 with
  // an opaque background — body scroll behind it can't be seen and
  // can't be triggered (the modal swallows pointer events). The body-
  // lock pattern (document.body.style.overflow = 'hidden') is needed only
  // for half-height sheets. Here it was a source of state leaks: onClose
  // is an inline arrow function in callers, so this effect re-ran on
  // every parent render, repeatedly capturing/restoring body.overflow.
  // Under certain interleavings (sheet closes while parent is mid-render)
  // the captured 'previous' state could be 'hidden' itself, and cleanup
  // would 'restore' body to 'hidden' — locking page scroll permanently
  // until the next navigation.
  useEffect(() => {
    if (!shouldRender) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [shouldRender, onClose]);

  if (!shouldRender || typeof document === 'undefined') return null;

  return createPortal(
    <div
      data-state={animState}
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1300,
        background: 'var(--cream-100)',
        // Slide-up enter / slide-down exit, no shadow because it's full-bleed
        transform: animState === 'open' ? 'translateY(0)' : 'translateY(100%)',
        transition: 'transform 280ms var(--ease-drawer)',
        display: 'flex',
        flexDirection: 'column',
        pointerEvents: animState === 'open' ? 'auto' : 'none',
      }}
    >
      {children}
    </div>,
    document.body,
  );
}

export default FullScreenSheet;

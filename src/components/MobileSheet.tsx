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

  // Track the visual viewport so the sheet sits above iOS Safari's bottom
  // toolbar, home indicator, and on-screen keyboard. Without this, `bottom: 0`
  // anchors to the layout viewport and action buttons end up behind chrome.
  const [bottomInset, setBottomInset] = useState(0);
  const [visibleHeight, setVisibleHeight] = useState<number | null>(null);

  useEffect(() => {
    if (!shouldRender || typeof window === 'undefined') return;
    const vv = window.visualViewport;

    const update = () => {
      const layoutH = window.innerHeight;
      const visualH = vv?.height ?? layoutH;
      const offsetTop = vv?.offsetTop ?? 0;
      // Space hidden below the visible viewport (Safari toolbar, keyboard).
      const obscuredBottom = Math.max(0, layoutH - visualH - offsetTop);
      const nextVisibleHeight = Math.max(160, visualH - 12);

      setVisibleHeight((prev) => (prev !== nextVisibleHeight ? nextVisibleHeight : prev));
      setBottomInset((prev) => (prev !== obscuredBottom ? obscuredBottom : prev));
    };
    update();

    // Primary signal — visualViewport (when iOS bothers to fire it).
    vv?.addEventListener('resize', update);
    vv?.addEventListener('scroll', update);

    // Backup signals — these catch some iOS Safari edge cases where the
    // visualViewport event doesn't fire on keyboard dismissal (e.g. when
    // the user taps outside an input rather than hitting "Done").
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    const onFocusChange = () => {
      // Defer one frame so the OS has time to start the keyboard transition.
      requestAnimationFrame(update);
    };
    document.addEventListener('focusin', onFocusChange);
    document.addEventListener('focusout', onFocusChange);

    // Last-resort safety net: poll at 4 Hz while the sheet is open.
    // The setState bail-out above keeps this cheap — no re-renders unless
    // the viewport actually changed.
    const interval = window.setInterval(update, 250);

    return () => {
      vv?.removeEventListener('resize', update);
      vv?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
      document.removeEventListener('focusin', onFocusChange);
      document.removeEventListener('focusout', onFocusChange);
      window.clearInterval(interval);
    };
  }, [shouldRender]);

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
    const scrollY = window.scrollY;
    const prevOverflow = document.body.style.overflow;
    const prevPadding = document.body.style.paddingRight;
    const prevPosition = document.body.style.position;
    const prevTop = document.body.style.top;
    const prevLeft = document.body.style.left;
    const prevRight = document.body.style.right;
    const prevWidth = document.body.style.width;
    // position:fixed prevents iOS Safari from jumping scroll to top when
    // overflow:hidden is applied — without this the backdrop shows the
    // wrong slice of the page (status timeline under the status bar).
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.width = '100%';
    document.body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPadding;
      document.body.style.position = prevPosition;
      document.body.style.top = prevTop;
      document.body.style.left = prevLeft;
      document.body.style.right = prevRight;
      document.body.style.width = prevWidth;
      window.scrollTo(0, scrollY);
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
          // Lift above Safari bottom toolbar / keyboard obscured area.
          bottom: bottomInset,
          background: 'var(--cream-50)',
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          // Always clamp to the live visual viewport height so action
          // buttons stay on-screen (PWA + Safari tab).
          maxHeight: visibleHeight !== null
            ? `${visibleHeight}px`
            : 'min(88vh, calc(100dvh - 24px))',
          display: 'flex',
          flexDirection: 'column',
          paddingBottom: bottomInset > 0 ? 0 : `env(safe-area-inset-bottom, 0px)`,
          boxShadow: '0 -8px 32px -8px rgba(31, 51, 41, 0.18)',
          // Combined transition: preserve the slide-in transform AND smooth
          // the keyboard-inset shift. (Class `.ios-sheet` already sets the
          // 320ms transform; we extend it here.)
          transition:
            'transform 320ms var(--ease-drawer), ' +
            'bottom 220ms var(--ease-drawer), ' +
            'max-height 220ms var(--ease-drawer)',
        }}
      >
        <div
          aria-hidden="true"
          style={{
            width: 40,
            height: 4,
            borderRadius: 2,
            background: 'var(--ios-ink-quad)',
            margin: '8px auto 2px',
          }}
        />
        {title && (
          <div
            style={{
              textAlign: 'center',
              padding: '12px 16px 14px',
              borderBottom: '0.5px solid var(--ios-separator)',
            }}
          >
            <div
              className="font-display"
              style={{
                fontSize: 22,
                fontWeight: 500,
                fontStyle: 'italic',
                letterSpacing: '-0.015em',
                color: 'var(--sage-700)',
                lineHeight: 1.1,
              }}
            >
              {title}
            </div>
          </div>
        )}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>{children}</div>
      </div>
    </div>,
    document.body,
  );
}

export default MobileSheet;

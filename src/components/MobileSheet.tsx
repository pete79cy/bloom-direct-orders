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

  // Track the visual viewport so the sheet can sit on top of the on-screen
  // keyboard on iOS Safari. Without this, `bottom: 0` puts the sheet
  // *behind* the keyboard, and `vh` units don't shrink when the keyboard
  // appears — the input and results disappear from view as the user types.
  const [keyboardInset, setKeyboardInset] = useState(0);
  const [vvHeight, setVvHeight] = useState<number | null>(null);

  useEffect(() => {
    if (!shouldRender || typeof window === 'undefined') return;
    const vv = window.visualViewport;

    // Distinguish "keyboard is up" from "URL bar / toolbar is showing".
    // iOS Safari's URL bar takes up to ~85px of vertical space, which
    // would otherwise be misread as a keyboard inset, causing the sheet
    // to shift up and shrink even with no keyboard present.
    //
    // Threshold of 100px reliably separates URL-bar chrome (≤ ~85px)
    // from any real on-screen keyboard (always ≥ ~250px on phones).
    const KEYBOARD_THRESHOLD_PX = 100;

    const update = () => {
      const layoutH = window.innerHeight;
      const visualH = vv?.height ?? layoutH;
      const heightDiff = layoutH - visualH;
      const offsetTop = vv?.offsetTop ?? 0;
      const keyboardOpen = heightDiff > KEYBOARD_THRESHOLD_PX;

      if (keyboardOpen) {
        // Real keyboard — lift the sheet by the hidden amount and clamp
        // max-height to the visible viewport.
        const inset = Math.max(0, heightDiff - offsetTop);
        setVvHeight((prev) => (prev !== visualH ? visualH : prev));
        setKeyboardInset((prev) => (prev !== inset ? inset : prev));
      } else {
        // No keyboard. Reset to defaults so the sheet sits at the bottom
        // and uses the standard 88vh cap (signalled by vvHeight === null).
        setVvHeight((prev) => (prev !== null ? null : prev));
        setKeyboardInset((prev) => (prev !== 0 ? 0 : prev));
      }
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
          // Shift the sheet UP by the height of the on-screen keyboard so
          // it stays fully visible (instead of hiding behind it).
          bottom: keyboardInset,
          background: 'var(--cream-50)',
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          // When the keyboard is up, constrain the sheet to fit within the
          // shrunken visual viewport (with a 24px top breathing space).
          //
          // Otherwise: use min(88vh, calc(100dvh - 24px)). The 88vh path is
          // the established cap when there's no browser chrome eating into
          // the viewport (e.g. installed PWA). 100dvh excludes iOS Safari's
          // dynamic browser chrome (the bottom toolbar) so the sheet doesn't
          // extend behind it on a regular Safari tab. min() picks whichever
          // is smaller. Supported on iOS Safari 15.4+ (March 2022); older
          // browsers gracefully ignore the calc() and fall back to 88vh.
          maxHeight: vvHeight !== null
            ? `${Math.max(160, vvHeight - 24)}px`
            : 'min(88vh, calc(100dvh - 24px))',
          display: 'flex',
          flexDirection: 'column',
          paddingBottom: keyboardInset > 0 ? 0 : `env(safe-area-inset-bottom, 0px)`,
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
        <div style={{ flex: 1, overflowY: 'auto' }}>{children}</div>
      </div>
    </div>,
    document.body,
  );
}

export default MobileSheet;

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Bottom modal sheet — iOS-native feel.
 *
 * Animation uses the data-state pattern (Radix-style) so BOTH enter and
 * exit play. The component stays mounted for the exit duration, then
 * unmounts.
 *
 * iOS bottom-anchor + keyboard handling — the important bit:
 * Don't try to COMPUTE the visible height. In an iOS standalone PWA,
 * `innerHeight` / `visualViewport.height` report the full layout viewport
 * (including the regions behind the status bar + home indicator), so a
 * shell sized to that number extends ~90px below the truly-visible area
 * and pushes the sheet's footer off-screen. No measured height unit
 * (vh/dvh/svh/visualViewport) gives the right "visible bottom" here.
 *
 * Instead, let iOS place the sheet with `position: fixed; bottom: 0` —
 * which reliably anchors to the real visible bottom (above the home
 * indicator in a PWA, above the toolbar in a Safari tab). The visual
 * viewport is used ONLY to lift the sheet above the on-screen keyboard:
 * `keyboardInset = max(0, innerHeight - visualViewport.height - offsetTop)`
 * is ~0 normally and the keyboard's height when it's open.
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

  // Distance the on-screen keyboard (or other transient bottom chrome)
  // obscures from the bottom of the layout viewport. ~0 normally; the
  // keyboard's height when it's open. Used to lift the bottom-anchored
  // sheet above the keyboard.
  const [keyboardInset, setKeyboardInset] = useState(0);

  useEffect(() => {
    if (!shouldRender || typeof window === 'undefined') return;
    const vv = window.visualViewport;

    const update = () => {
      const obscured = vv
        ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
        : 0;
      setKeyboardInset((prev) => (prev !== obscured ? obscured : prev));
    };
    update();

    vv?.addEventListener('resize', update);
    vv?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    // iOS sometimes skips the visualViewport event on keyboard dismissal
    // when the user taps away rather than hitting "Done" — defer a frame.
    const onFocusChange = () => requestAnimationFrame(update);
    document.addEventListener('focusin', onFocusChange);
    document.addEventListener('focusout', onFocusChange);
    // Last-resort poll; the setState bail-outs above keep it free of
    // re-renders unless the viewport actually moved.
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
    // wrong slice of the page.
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
          // `position: fixed; bottom` lets iOS anchor the sheet to the true
          // visible bottom (above the home indicator / Safari toolbar) — no
          // measured-height guesswork. keyboardInset lifts it above the
          // on-screen keyboard when one is open.
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: keyboardInset,
          background: 'var(--cream-50)',
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          maxHeight: `calc(100dvh - ${keyboardInset}px - 12px)`,
          display: 'flex',
          flexDirection: 'column',
          // NOTE: no bottom safe-area padding here — consumers own their
          // footer's bottom inset (see NotifyCustomerSheet / PdfActionSheet).
          boxShadow: '0 -8px 32px -8px rgba(31, 51, 41, 0.18)',
          transition: 'bottom 220ms var(--ease-drawer)',
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
            flexShrink: 0,
          }}
        />
        {title && (
          <div
            style={{
              textAlign: 'center',
              padding: '12px 16px 14px',
              borderBottom: '0.5px solid var(--ios-separator)',
              flexShrink: 0,
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
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default MobileSheet;

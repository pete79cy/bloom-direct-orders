import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Bottom modal sheet — iOS-native feel.
 *
 * Animation uses the data-state pattern (Radix-style) so BOTH enter and
 * exit play. The component stays mounted for the exit duration, then
 * unmounts.
 *
 * iOS Safari toolbar / keyboard handling — the important bit:
 * A `position: fixed` element is laid out against the LAYOUT viewport,
 * which in iOS Safari extends BEHIND the bottom toolbar. So `bottom: 0`
 * sits behind the toolbar, hiding a sheet's action buttons. You cannot
 * detect the toolbar by comparing innerHeight to visualViewport.height —
 * both already exclude it, so the difference is ~0.
 *
 * The robust fix used here: size the SHELL to the visual viewport
 * (`top: visualViewport.offsetTop`, `height: visualViewport.height`).
 * The visual viewport is the truly-visible area — it excludes the Safari
 * toolbar AND shrinks when the keyboard opens. With the shell pinned to
 * it, the sheet's `bottom: 0` is always the bottom of what the user can
 * see, so a pinned footer stays on-screen in every case. Falls back to
 * `100dvh` when visualViewport is unavailable.
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

  // The shell is sized + positioned to the visual viewport so its bottom
  // edge is the bottom of the *visible* area (above toolbar + keyboard).
  const [vvHeight, setVvHeight] = useState<number | null>(null);
  const [vvTop, setVvTop] = useState(0);

  useEffect(() => {
    if (!shouldRender || typeof window === 'undefined') return;
    const vv = window.visualViewport;

    const update = () => {
      const h = vv?.height ?? window.innerHeight;
      const t = vv?.offsetTop ?? 0;
      setVvHeight((prev) => (prev !== h ? h : prev));
      setVvTop((prev) => (prev !== t ? t : prev));
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
      // Pinned to the VISUAL viewport, not `inset: 0`. This is what keeps a
      // sheet's footer above the iOS Safari bottom toolbar + keyboard.
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        top: vvTop,
        height: vvHeight !== null ? `${vvHeight}px` : '100dvh',
        zIndex: 1200,
        pointerEvents: animState === 'open' ? 'auto' : 'none',
        // Smooth the height/position change when the keyboard opens/closes.
        transition: 'height 220ms var(--ease-drawer), top 220ms var(--ease-drawer)',
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
          background: 'var(--cream-50)',
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          // Clamp to the shell (= visible area) so a tall sheet still leaves
          // the footer on-screen; short content hugs the bottom.
          maxHeight: '100%',
          display: 'flex',
          flexDirection: 'column',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          boxShadow: '0 -8px 32px -8px rgba(31, 51, 41, 0.18)',
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

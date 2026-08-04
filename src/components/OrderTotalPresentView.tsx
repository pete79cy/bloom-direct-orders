import { useEffect, useRef, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';

/** Single line as shown in the present view. The shape mirrors what
 *  OrderDetail already computes for the inline lines list — we re-use it
 *  rather than re-deriving from raw OrderLineEnriched. */
export interface PresentLine {
  id: string;
  description: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
}

interface VatRow {
  rate: number;
  net: number;
  amount: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  orderNumber: string;
  customerName: string;
  lines: PresentLine[];          // active lines only (caller filters cancelled)
  subtotal: number;
  vatBreakdown: VatRow[];        // per-rate VAT breakdown (matches OrderDetail card)
  grandTotal: number;
  formatEur: (n: number) => string;
}

/**
 * Full-screen, high-contrast "present mode" for showing a customer their
 * order total in sunlight. Ported from bloom-crm/MobileOrderDetail's
 * OrderPresentView but restyled to match bloom-direct-orders' bo-paper /
 * sage palette and Fraunces display font.
 *
 * Purely presentational — all numbers are passed in from OrderDetail so
 * there's no risk of subtle calc drift between the inline summary and the
 * present view.
 */
export default function OrderTotalPresentView({
  open, onClose, orderNumber, customerName, lines,
  subtotal, vatBreakdown, grandTotal, formatEur,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Scroll affordance — on long orders the lines list clips behind the
  // totals footer with no visual hint, and customers read the visible
  // lines as the whole order. Track whether unscrolled content remains
  // and surface a fade + "more products" pill until the list bottoms out.
  const scrollRef = useRef<HTMLDivElement>(null);
  const [hasMoreBelow, setHasMoreBelow] = useState(false);

  useEffect(() => {
    if (!open) return;
    const el = scrollRef.current;
    if (!el) return;
    // 8px slack: iOS reports fractional scroll positions near the end.
    const update = () => {
      setHasMoreBelow(el.scrollHeight - el.scrollTop - el.clientHeight > 8);
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      el.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [open, lines.length]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Προβολή συνόλου"
      style={{
        position: 'fixed', inset: 0, zIndex: 1200,
        background: 'var(--cream-100, #FBF7EE)',
        color: 'var(--ink-900)',
        display: 'flex', flexDirection: 'column',
        animation: 'presentIn 180ms cubic-bezier(0.23,1,0.32,1)',
      }}
    >
      <button
        type="button"
        aria-label="Κλείσιμο"
        onClick={onClose}
        className="ios-tap"
        style={{
          position: 'absolute',
          top: 'calc(env(safe-area-inset-top,0px) + 8px)',
          right: 12,
          width: 44, height: 44,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'transparent', border: 0, color: 'var(--ink-900)',
          cursor: 'pointer',
        }}
      >
        <X size={28} strokeWidth={2.5} />
      </button>

      <div style={{ padding: 'calc(env(safe-area-inset-top,0px) + 20px) 24px 12px' }}>
        <div
          className="font-mono-meta"
          style={{
            fontSize: 11,
            color: 'var(--ink-500)',
            letterSpacing: '0.06em',
          }}
        >
          {orderNumber}
        </div>
        <div
          className="font-display"
          style={{
            fontSize: 30,
            fontWeight: 500,
            fontStyle: 'italic',
            lineHeight: 1.1,
            paddingRight: 48,
            marginTop: 4,
            color: 'var(--ink-900)',
          }}
        >
          {customerName}
        </div>
      </div>

      <div style={{ flex: 1, position: 'relative', minWidth: 0, minHeight: 0, display: 'flex' }}>
        <div ref={scrollRef} data-testid="present-lines-scroll" style={{ flex: 1, overflowY: 'auto', padding: '0 24px' }}>
        {lines.length === 0 ? (
          <div style={{ padding: '24px 0', fontSize: 16, color: 'var(--ink-500)' }}>
            Καμία γραμμή.
          </div>
        ) : lines.map((l) => (
          <div
            key={l.id}
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 12,
              padding: '14px 0',
              borderBottom: '1px solid rgba(63,75,70,0.10)',
            }}
          >
            <div
              style={{
                flex: 1,
                minWidth: 0,
                fontSize: 19,
                fontWeight: 600,
                color: 'var(--ink-900)',
                lineHeight: 1.25,
              }}
            >
              {l.description}
            </div>
            <div
              className="font-mono-meta"
              style={{
                fontSize: 14,
                fontWeight: 500,
                color: 'var(--ink-500)',
                whiteSpace: 'nowrap',
              }}
            >
              {l.qty} × {formatEur(l.unitPrice)}
            </div>
            <div
              className="font-mono-meta"
              style={{
                fontSize: 18,
                fontWeight: 600,
                whiteSpace: 'nowrap',
                minWidth: 88,
                textAlign: 'right',
                color: 'var(--ink-900)',
              }}
            >
              {formatEur(l.lineTotal)}
            </div>
          </div>
        ))}
        </div>

        {hasMoreBelow && (
          <>
            {/* Fade hints that lines continue under the totals footer. */}
            <div
              aria-hidden="true"
              style={{
                position: 'absolute',
                left: 0, right: 0, bottom: 0,
                height: 64,
                pointerEvents: 'none',
                background: 'linear-gradient(to bottom, rgba(251,247,238,0), var(--cream-100, #FBF7EE))',
              }}
            />
            <button
              type="button"
              onClick={() => {
                const el = scrollRef.current;
                if (el) el.scrollBy({ top: el.clientHeight * 0.8, behavior: 'smooth' });
              }}
              className="ios-tap"
              style={{
                position: 'absolute',
                left: '50%', bottom: 10,
                transform: 'translateX(-50%)',
                display: 'inline-flex', alignItems: 'center', gap: 6,
                height: 34, padding: '0 14px',
                borderRadius: 999, border: 0,
                background: 'var(--sage-700, #4E7549)',
                color: 'var(--cream-50, #FFFDF7)',
                fontSize: 13, fontWeight: 600,
                boxShadow: '0 2px 10px rgba(63,75,70,0.25)',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              <ChevronDown size={15} strokeWidth={2.4} />
              Κι άλλα προϊόντα
            </button>
          </>
        )}
      </div>

      <div
        style={{
          padding: '14px 24px calc(env(safe-area-inset-bottom,0px) + 18px)',
          borderTop: '2px solid var(--sage-700, #4E7549)',
          background: 'var(--cream-100, #FBF7EE)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 15,
            marginBottom: 6,
          }}
        >
          <span style={{ color: 'var(--ink-500)' }}>Υποσύνολο</span>
          <span className="font-mono-meta" style={{ fontWeight: 600, color: 'var(--ink-900)' }}>
            {formatEur(subtotal)}
          </span>
        </div>
        {vatBreakdown.map((row) => (
          <div
            key={row.rate}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 15,
              marginBottom: 6,
            }}
          >
            <span style={{ color: 'var(--ink-500)' }}>ΦΠΑ {row.rate}%</span>
            <span className="font-mono-meta" style={{ fontWeight: 600, color: 'var(--ink-900)' }}>
              {formatEur(row.amount)}
            </span>
          </div>
        ))}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            paddingTop: 12,
            marginTop: 6,
            borderTop: '1px solid rgba(63,75,70,0.16)',
          }}
        >
          <span
            className="font-display"
            style={{
              fontSize: 22,
              fontWeight: 500,
              fontStyle: 'italic',
              color: 'var(--sage-800, #3D5C39)',
            }}
          >
            Σύνολο
          </span>
          <span
            className="font-mono-meta"
            style={{
              fontSize: 42,
              fontWeight: 600,
              lineHeight: 1,
              color: 'var(--sage-800, #3D5C39)',
            }}
          >
            {formatEur(grandTotal)}
          </span>
        </div>
      </div>
    </div>
  );
}

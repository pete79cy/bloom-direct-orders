import { useEffect } from 'react';
import { X } from 'lucide-react';

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

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 24px' }}>
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
              className="font-display"
              style={{
                flex: 1,
                minWidth: 0,
                fontStyle: 'italic',
                fontSize: 19,
                fontWeight: 500,
                color: 'var(--ink-900)',
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

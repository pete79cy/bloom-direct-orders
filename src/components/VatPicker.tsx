import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { VAT_RATES, VAT_LABEL, type VatRate } from '@/lib/vat';

interface Props {
  value: VatRate;
  onChange: (rate: VatRate) => void;
}

/**
 * Small per-line VAT dropdown. Closed: a chip showing the active rate
 * with a chevron. Open: a popover scaling out from the chip itself with
 * the two options as 44px-tall tap targets.
 *
 * Emil care:
 *  - transform-origin = bottom-right (where the trigger sits) so the
 *    popover feels anchored to the chip, not floating from center
 *  - ease-out custom curve, 160ms enter / 120ms exit (asymmetric)
 *  - scale(0.94) → scale(1) — never from scale(0)
 *  - chip :active scale(0.97) for haptic press feedback
 *  - opens UPWARD by default; in step 3 the picker lives inside scrollable
 *    cards stacked top→bottom, and upward avoids overlap with the next row
 */
export default function VatPicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const id = useId();

  // Close on outside tap or Escape
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`vat-list-${id}`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          height: 24,
          padding: '0 8px 0 9px',
          borderRadius: 999,
          background: open ? 'var(--sage-100)' : 'rgba(63,75,70,0.06)',
          color: 'var(--ink-700)',
          fontSize: 11,
          fontWeight: 500,
          letterSpacing: '0.01em',
          transition:
            'transform 160ms cubic-bezier(0.23, 1, 0.32, 1), background 160ms ease, color 160ms ease',
          transformOrigin: 'center',
        }}
        className="ios-tap"
      >
        <span className="font-mono-meta" style={{ fontSize: 10.5, letterSpacing: 0 }}>
          {VAT_LABEL[value]}
        </span>
        <ChevronDown
          size={11}
          strokeWidth={2}
          style={{
            transition: 'transform 200ms cubic-bezier(0.23, 1, 0.32, 1)',
            transform: open ? 'rotate(180deg)' : 'rotate(0)',
          }}
        />
      </button>

      {open && (
        <ul
          id={`vat-list-${id}`}
          role="listbox"
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 6px)',
            right: 0,
            minWidth: 124,
            padding: 4,
            background: '#fff',
            borderRadius: 12,
            border: '1px solid rgba(63,75,70,0.08)',
            boxShadow:
              '0 1px 2px rgba(31,51,41,0.06), 0 8px 24px -8px rgba(31,51,41,0.18)',
            zIndex: 50,
            transformOrigin: 'bottom right',
            // Entry via @starting-style fallback: animation-driven, ends at final state
            animation: 'vat-pop 160ms cubic-bezier(0.23, 1, 0.32, 1)',
            listStyle: 'none',
            margin: 0,
          }}
        >
          {VAT_RATES.map((r) => {
            const active = r === value;
            return (
              <li key={r} role="option" aria-selected={active}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(r);
                    setOpen(false);
                  }}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    height: 38,
                    padding: '0 10px',
                    borderRadius: 8,
                    background: active ? 'var(--sage-50)' : 'transparent',
                    color: active ? 'var(--sage-800)' : 'var(--ink-700)',
                    fontSize: 13,
                    fontWeight: active ? 500 : 400,
                    transition: 'background 120ms ease',
                  }}
                  onMouseEnter={(e) => {
                    if (!active) e.currentTarget.style.background = 'var(--sage-50)';
                  }}
                  onMouseLeave={(e) => {
                    if (!active) e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <span className="font-mono-meta" style={{ fontSize: 12 }}>
                    {VAT_LABEL[r]}
                  </span>
                  {active && <Check size={13} color="var(--sage-700)" strokeWidth={2.25} />}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* Local keyframes — kept inline so the component is self-contained.
          Using transitions wasn't viable here because the popover mounts/
          unmounts. Animation runs once on mount; nothing to interrupt. */}
      <style>{`
        @keyframes vat-pop {
          from {
            opacity: 0;
            transform: scale(0.94) translateY(2px);
            filter: blur(2px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
            filter: blur(0);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes vat-pop {
            from { opacity: 0; }
            to { opacity: 1; }
          }
        }
      `}</style>
    </div>
  );
}

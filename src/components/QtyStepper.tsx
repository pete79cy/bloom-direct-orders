import { useEffect, useRef, useState } from 'react';
import { Minus, Plus } from 'lucide-react';

interface Props {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}

/**
 * Hybrid quantity stepper — buttons + typeable input in one control.
 *
 * Two complementary input modes:
 *   • −/+ buttons for quick small adjustments
 *   • Tap on the number → numeric keypad for direct entry
 *
 * The number portion is styled like a real input field at REST (white
 * background, subtle border) so the editability is discoverable without
 * the user having to guess. On focus the border thickens and goes sage
 * with a soft glow ring. inputMode="numeric" + pattern="[0-9]*" gives
 * iOS the dedicated number keypad immediately.
 *
 * 16px font on the input so iOS Safari doesn't auto-zoom on focus.
 */
export default function QtyStepper({ value, onChange, min = 0, max }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(String(value));
  }, [value, editing]);

  const canDec = value > min;
  const canInc = max === undefined || value < max;

  function commit() {
    const n = parseInt(draft, 10);
    if (Number.isFinite(n)) {
      const clamped = Math.max(min, max === undefined ? n : Math.min(n, max));
      if (clamped !== value) onChange(clamped);
      setDraft(String(clamped));
    } else {
      setDraft(String(value));
    }
    setEditing(false);
  }

  function cancel() {
    setDraft(String(value));
    setEditing(false);
    inputRef.current?.blur();
  }

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        height: 40,
      }}
    >
      <button
        type="button"
        aria-label="Μείωση"
        disabled={!canDec}
        onClick={() => canDec && onChange(value - 1)}
        className="ios-tap"
        style={{
          width: 32,
          height: 32,
          borderRadius: 999,
          background: 'rgba(63,75,70,0.06)',
          color: 'var(--ink-700)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: !canDec ? 0.35 : 1,
          transition: 'opacity 160ms ease',
          flexShrink: 0,
        }}
      >
        <Minus size={14} strokeWidth={2} />
      </button>

      {/* Editable number — styled as a real input even at rest */}
      <div
        onClick={() => inputRef.current?.focus()}
        style={{
          position: 'relative',
          width: 64,
          height: 36,
          background: '#fff',
          border: editing
            ? '1.5px solid var(--sage-400)'
            : '1px solid rgba(63,75,70,0.16)',
          borderRadius: 10,
          boxShadow: editing
            ? '0 0 0 3px rgba(63,107,92,0.15)'
            : 'inset 0 1px 1px rgba(0,0,0,0.02)',
          transition:
            'border-color 160ms ease, box-shadow 160ms ease',
          cursor: 'text',
          overflow: 'hidden',
        }}
      >
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          aria-label="Ποσότητα"
          value={editing ? draft : String(value)}
          onFocus={(e) => {
            setEditing(true);
            setDraft(String(value));
            e.target.select();
          }}
          onChange={(e) => {
            const next = e.target.value.replace(/[^0-9]/g, '');
            setDraft(next);
          }}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
              inputRef.current?.blur();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              cancel();
            }
          }}
          style={{
            width: '100%',
            height: '100%',
            textAlign: 'center',
            fontFamily: 'var(--font-mono)',
            // 16px so iOS Safari doesn't auto-zoom on focus
            fontSize: 16,
            fontWeight: 500,
            color: 'var(--ink-900)',
            background: 'transparent',
            border: 'none',
            outline: 'none',
            padding: 0,
            appearance: 'none',
            MozAppearance: 'textfield',
            caretColor: 'var(--sage-700)',
          }}
        />
      </div>

      <button
        type="button"
        aria-label="Αύξηση"
        disabled={!canInc}
        onClick={() => canInc && onChange(value + 1)}
        className="ios-tap"
        style={{
          width: 32,
          height: 32,
          borderRadius: 999,
          background: 'var(--sage-700)',
          color: 'var(--cream-50)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: !canInc ? 0.35 : 1,
          transition: 'opacity 160ms ease',
          flexShrink: 0,
        }}
      >
        <Plus size={14} strokeWidth={2} color="var(--cream-50)" />
      </button>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { Minus, Plus } from 'lucide-react';

interface Props {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}

/**
 * Hybrid quantity stepper.
 *
 * Two complementary input modes living in the same control:
 *   • The −/+ buttons for quick small adjustments (one tap)
 *   • Tap on the number itself → focused <input> with the numeric
 *     keyboard for typing larger qtys directly (e.g. "150")
 *
 * Commits on blur or Enter. Escape cancels back to the prior value.
 * Empty string is tolerated mid-edit so the user can backspace and
 * retype — it just doesn't commit until a valid number is in there.
 *
 * Emil care:
 *   - sage focus ring (`focus-visible: 0 0 0 3px rgba(63,107,92,0.18)`)
 *   - scale(0.97) on −/+ press, but never on the number itself (typing
 *     should feel like editing text, not pressing a button)
 *   - inputMode="numeric" so iOS shows the number pad immediately
 *   - pattern="[0-9]*" so iOS Safari uses the dedicated numeric keypad
 *   - 200ms ease-out colour transitions on focus/blur
 */
export default function QtyStepper({ value, onChange, min = 0, max }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep the draft in sync with external value changes when not actively editing.
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
      // Revert
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
        background: editing ? '#fff' : 'rgba(63,75,70,0.06)',
        border: editing ? '1.5px solid var(--sage-400)' : '1.5px solid transparent',
        boxShadow: editing ? '0 0 0 3px rgba(63,107,92,0.15)' : 'none',
        borderRadius: 999,
        padding: 3,
        height: 36,
        transition:
          'background 160ms ease, border-color 160ms ease, box-shadow 160ms ease',
      }}
    >
      <button
        type="button"
        aria-label="Μείωση"
        disabled={!canDec || editing}
        onClick={() => canDec && onChange(value - 1)}
        className="ios-tap"
        style={{
          width: 30,
          height: 30,
          borderRadius: 999,
          background: '#fff',
          color: 'var(--ink-700)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: editing || !canDec ? 0.35 : 1,
          transition: 'opacity 160ms ease',
        }}
      >
        <Minus size={12} />
      </button>

      {/* Editable numeric centre */}
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
          // Select all so typing replaces it immediately — the most common
          // intent when tapping the number to enter "150" over "1". Sync
          // select() works on iOS Safari for type="text" inputs (it would
          // fail for type="number" which is why we use text + inputMode).
          e.target.select();
        }}
        onChange={(e) => {
          // Only allow digits while editing.
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
          width: 46,
          height: 30,
          textAlign: 'center',
          fontFamily: 'var(--font-mono)',
          fontSize: 14,
          fontWeight: 500,
          color: 'var(--ink-900)',
          background: 'transparent',
          border: 'none',
          outline: 'none',
          padding: 0,
          // Hide the spin buttons that some browsers add to number inputs
          appearance: 'none',
          MozAppearance: 'textfield',
        }}
      />

      <button
        type="button"
        aria-label="Αύξηση"
        disabled={!canInc || editing}
        onClick={() => canInc && onChange(value + 1)}
        className="ios-tap"
        style={{
          width: 30,
          height: 30,
          borderRadius: 999,
          background: 'var(--sage-700)',
          color: 'var(--cream-50)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: editing || !canInc ? 0.35 : 1,
          transition: 'opacity 160ms ease',
        }}
      >
        <Plus size={12} />
      </button>
    </div>
  );
}

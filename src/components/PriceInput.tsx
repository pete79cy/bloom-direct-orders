import { useEffect, useRef, useState } from 'react';

interface Props {
  value: number;
  onChange: (next: number) => void;
  /** Source tag rendered below the input (e.g. "τιμή πελάτη"). */
  hint?: string;
  /** Color of the source tag. */
  hintColor?: string;
  /** Optional small icon (lucide) rendered inline with the hint. */
  hintIcon?: React.ReactNode;
  /** Sells in red when truthy (loss vs cost). */
  warn?: boolean;
}

/**
 * Editable money input. Always looks like an input — never a passive label.
 *
 * Behaviour:
 *   - Currency prefix € sits inside the input, left-aligned, ink-500.
 *   - The user types digits + decimal; we keep them in a local string until
 *     blur, then parse → commit → reformat. This is the standard "edit-then-
 *     commit" loop that lets the user type "4." or "4,5" without fighting
 *     the formatter.
 *   - Focus state: sage-300 border + sage-100 ring + lifted shadow.
 *   - inputMode="decimal" so iOS shows the number pad.
 *   - Greek decimal comma is accepted on parse.
 *   - selectAllOnFocus = true makes overwriting trivial (the # 1 reason
 *     mobile price inputs feel bad).
 */
export default function PriceInput({
  value, onChange, hint, hintColor, hintIcon, warn = false,
}: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(formatForEdit(value));
  const [focused, setFocused] = useState(false);

  // Sync from outside (e.g. customer price autoload, qty change resetting price)
  useEffect(() => {
    if (!focused) setText(formatForEdit(value));
  }, [value, focused]);

  function commit() {
    const next = parseMoney(text);
    if (next !== null && next !== value) onChange(next);
    setText(formatForEdit(next ?? value));
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <label
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          height: 38,
          paddingLeft: 26,
          paddingRight: 10,
          borderRadius: 10,
          background: '#fff',
          border: `1.5px solid ${focused ? 'var(--sage-400)' : warn ? 'rgba(179,85,61,0.45)' : 'rgba(63,75,70,0.15)'}`,
          boxShadow: focused
            ? '0 0 0 4px rgba(63,107,92,0.10)'
            : '0 1px 1px rgba(31,51,41,0.03)',
          transition:
            'border-color 160ms cubic-bezier(0.23, 1, 0.32, 1), ' +
            'box-shadow 160ms cubic-bezier(0.23, 1, 0.32, 1)',
          cursor: 'text',
        }}
        onClick={() => ref.current?.focus()}
      >
        {/* Currency prefix */}
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: 10,
            top: '50%',
            transform: 'translateY(-50%)',
            fontFamily: 'var(--font-mono)',
            fontSize: 13,
            color: focused ? 'var(--sage-700)' : 'var(--ink-500)',
            transition: 'color 160ms ease',
            pointerEvents: 'none',
          }}
        >
          €
        </span>
        <input
          ref={ref}
          type="text"
          inputMode="decimal"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onFocus={(e) => {
            setFocused(true);
            // Select all so the next keystroke replaces — feels much better
            // than typing into the middle of a formatted number
            requestAnimationFrame(() => e.target.select());
          }}
          onBlur={() => {
            setFocused(false);
            commit();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.currentTarget.blur();
            }
          }}
          aria-label="Τιμή πώλησης"
          style={{
            flex: 1,
            minWidth: 0,
            width: '100%',
            border: 'none',
            outline: 'none',
            background: 'transparent',
            fontFamily: 'var(--font-mono)',
            fontSize: 14,
            fontWeight: 500,
            color: warn ? 'var(--clay)' : 'var(--ink-900)',
            textAlign: 'right',
            letterSpacing: 0,
            padding: 0,
          }}
        />
      </label>

      {/* Source hint — small, lives outside the input box */}
      {hint && (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 10,
            color: hintColor ?? 'var(--ink-500)',
            paddingLeft: 2,
            lineHeight: 1.1,
          }}
        >
          {hintIcon}
          {hint}
        </span>
      )}
    </div>
  );
}

/* ── Parse helpers ────────────────────────────────────────── */

function formatForEdit(n: number): string {
  if (!Number.isFinite(n)) return '0';
  // Show 2 decimals in the field always; user can erase to retype
  return n.toFixed(2).replace('.', ',');
}

function parseMoney(text: string): number | null {
  if (!text.trim()) return 0;
  // Accept both "4,50" (el-GR) and "4.50" (en)
  const normalised = text
    .replace(/\s/g, '')
    .replace(/€/g, '')
    .replace(',', '.');
  const n = parseFloat(normalised);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

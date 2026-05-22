import { Check } from 'lucide-react';
import type { OrderStatus } from '@/types';

const STEPS: { key: OrderStatus; label: string }[] = [
  { key: 'PENDING', label: 'Εκκρεμής' },
  { key: 'PREPARING', label: 'Ετοιμασία' },
  { key: 'READY', label: 'Έτοιμη' },
  { key: 'DELIVERED', label: 'Παράδοση' },
];

interface Props {
  current: OrderStatus;
}

/**
 * Horizontal 4-stop progress for an order's lifecycle.
 * - Past steps: filled sage circle with a check
 * - Current step: filled sage circle with a soft glow ring + small white centre dot
 * - Future steps: empty white circle with a hairline ink-100 border
 * Connector lines between dots are sage if reached, ink-100 otherwise.
 */
export default function StatusTimeline({ current }: Props) {
  const currentIdx = STEPS.findIndex((s) => s.key === current);

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start' }}>
      {STEPS.map((s, i) => {
        const done = i < currentIdx;
        const isCur = i === currentIdx;
        const reached = done || isCur;
        const borderColor = reached ? 'var(--sage-700)' : 'var(--ink-100)';

        return (
          <div
            key={s.key}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              position: 'relative',
            }}
          >
            {/* Connector to previous step */}
            {i > 0 && (
              <div
                style={{
                  position: 'absolute',
                  top: 12,
                  right: '50%',
                  width: '100%',
                  height: 2,
                  background: i <= currentIdx ? 'var(--sage-700)' : 'var(--ink-100)',
                }}
              />
            )}
            {/* Dot */}
            <div
              style={{
                position: 'relative',
                width: 26,
                height: 26,
                borderRadius: 999,
                background: reached ? 'var(--sage-700)' : '#fff',
                border: `2px solid ${borderColor}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1,
                boxShadow: isCur ? '0 0 0 4px rgba(63,107,92,0.15)' : 'none',
              }}
            >
              {done && <Check size={12} color="var(--cream-50)" />}
              {isCur && (
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 999,
                    background: 'var(--cream-50)',
                  }}
                />
              )}
            </div>
            <p
              style={{
                fontSize: 11,
                marginTop: 8,
                color: isCur ? 'var(--sage-700)' : done ? 'var(--ink-700)' : 'var(--ink-300)',
                fontWeight: isCur ? 600 : 400,
              }}
            >
              {s.label}
            </p>
          </div>
        );
      })}
    </div>
  );
}

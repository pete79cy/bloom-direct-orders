import { Check } from 'lucide-react';
import type { QuoteStatus } from '@/types';

const STEPS = [
  { key: 'DRAFT', label: 'Πρόχειρη' },
  { key: 'SENT', label: 'Εστάλη' },
  { key: 'ACCEPTED', label: 'Αποδεκτή' },
  { key: 'ORDER', label: 'Παραγγελία' },
] as const;

/**
 * DRAFT → SENT → ACCEPTED → order, drawn exactly like StatusTimeline.
 * REJECTED / EXPIRED stop at the last reached step and paint it clay.
 */
export default function QuoteStatusTimeline({ status, hasOrder }: { status: QuoteStatus; hasOrder: boolean }) {
  let currentIdx: number;
  if (hasOrder) currentIdx = 3;
  else if (status === 'ACCEPTED' || status === 'CONVERTED') currentIdx = 2;
  else if (status === 'SENT' || status === 'EXPIRED' || status === 'REJECTED') currentIdx = 1;
  else currentIdx = 0;
  const stopped = status === 'REJECTED' || status === 'EXPIRED';
  const accent = stopped ? 'var(--clay)' : 'var(--sage-700)';

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start' }}>
      {STEPS.map((s, i) => {
        const done = i < currentIdx;
        const isCur = i === currentIdx;
        const reached = done || isCur;
        return (
          <div
            key={s.key}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}
          >
            {i > 0 && (
              <div
                style={{
                  position: 'absolute', top: 12, right: '50%', width: '100%', height: 2,
                  background: i <= currentIdx ? 'var(--sage-700)' : 'var(--ink-100)',
                }}
              />
            )}
            <div
              style={{
                position: 'relative', width: 26, height: 26, borderRadius: 999, zIndex: 1,
                background: reached ? (isCur ? accent : 'var(--sage-700)') : '#fff',
                border: `2px solid ${reached ? (isCur ? accent : 'var(--sage-700)') : 'var(--ink-100)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: isCur ? `0 0 0 4px ${stopped ? 'rgba(179,85,61,0.15)' : 'rgba(63,107,92,0.15)'}` : 'none',
              }}
            >
              {done && <Check size={12} color="var(--cream-50)" />}
              {isCur && <div style={{ width: 8, height: 8, borderRadius: 999, background: 'var(--cream-50)' }} />}
            </div>
            <p
              style={{
                fontSize: 11, marginTop: 8,
                color: isCur ? accent : done ? 'var(--ink-700)' : 'var(--ink-300)',
                fontWeight: isCur ? 600 : 400,
              }}
            >
              {isCur && status === 'REJECTED' ? 'Απορρίφθηκε' : isCur && status === 'EXPIRED' ? 'Έληξε' : s.label}
            </p>
          </div>
        );
      })}
    </div>
  );
}

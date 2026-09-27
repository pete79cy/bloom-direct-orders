import { useState } from 'react';
import { MobileSheet } from './MobileSheet';
import { fmtEUR } from '@/lib/format';
import { PRICE_SCOPE_LABEL, type GroupDeviation } from '@/lib/quote';
import type { PriceScope } from '@/types';

interface Props {
  open: boolean;
  deviations: GroupDeviation[];
  memberCount: number;
  onCancel: () => void;
  onChoose: (scope: PriceScope) => void;
}

const SCOPES: PriceScope[] = ['quote', 'customer', 'group'];

/**
 * Mobile version of bloom-crm's GroupDeviationDialog. Bloom refuses to send
 * a quote (422 GROUP_PRICE_DEVIATIONS) while a line's price differs from the
 * customer group's price without saying what that difference means. The
 * operator picks one scope for all deviating lines; the caller re-saves
 * with price_scope set, and Bloom updates (or leaves) the pricelists.
 */
export default function GroupPriceSheet({ open, deviations, memberCount, onCancel, onChoose }: Props) {
  const [scope, setScope] = useState<PriceScope>('quote');

  return (
    <MobileSheet open={open} onClose={onCancel} title="Τιμές ομίλου">
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '4px 16px 12px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ fontSize: 14, color: 'var(--ink-700)', lineHeight: 1.45, margin: 0 }}>
            {deviations.length === 1 ? 'Μία γραμμή έχει' : `${deviations.length} γραμμές έχουν`} διαφορετική
            τιμή από τον τιμοκατάλογο του ομίλου
            {memberCount > 0 ? ` (${memberCount} ακόμη μέλη)` : ''}. Διάλεξε τι σημαίνει η νέα τιμή.
          </p>

          <div style={{ background: '#fff', borderRadius: 14, boxShadow: 'var(--shadow-card)', overflow: 'hidden' }}>
            {deviations.map((d, i) => (
              <div key={d.line_no}>
                {i > 0 && <div className="hairline" style={{ margin: '0 14px' }} />}
                <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'baseline', gap: 10 }}>
                  <span style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>{d.display_name}</span>
                  <span className="font-mono-meta" style={{ fontSize: 12, color: 'var(--ink-500)', textDecoration: 'line-through' }}>
                    {fmtEUR(d.group_price)}
                  </span>
                  <span className="font-mono-meta" style={{ fontSize: 13, fontWeight: 500, color: 'var(--sage-800)' }}>
                    {fmtEUR(d.line_price)}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div role="radiogroup" aria-label="Εμβέλεια τιμής" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {SCOPES.map((s) => {
              const on = s === scope;
              return (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setScope(s)}
                  className="ios-tap"
                  style={{
                    textAlign: 'left', padding: '12px 14px', borderRadius: 14,
                    background: on ? 'var(--sage-100)' : '#fff',
                    border: `1.5px solid ${on ? 'var(--sage-700)' : 'rgba(63,75,70,0.12)'}`,
                  }}
                >
                  <div style={{ fontSize: 15, fontWeight: 600, color: on ? 'var(--sage-800)' : 'var(--ink-900)' }}>
                    {PRICE_SCOPE_LABEL[s].title}
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--ink-500)', marginTop: 2 }}>{PRICE_SCOPE_LABEL[s].sub}</div>
                </button>
              );
            })}
          </div>
        </div>

        <div
          style={{
            flexShrink: 0, paddingTop: 12, paddingLeft: 16, paddingRight: 16,
            paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 16px)',
            borderTop: '1px solid rgba(63,75,70,0.08)', background: 'var(--cream-50)',
          }}
        >
          <button type="button" className="btn-primary ios-tap" onClick={() => onChoose(scope)}>
            Συνέχεια αποστολής
          </button>
        </div>
      </div>
    </MobileSheet>
  );
}

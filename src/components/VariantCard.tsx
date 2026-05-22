import { Plus, Check, Tag } from 'lucide-react';
import { prettyScientificName, cleanSizeSummary, fallbackVariantLabel } from '@/lib/plant-display';
import { fmtEUR } from '@/lib/format';
import PlantTile from './PlantTile';
import type { Plant, Variant } from '@/types';

interface Props {
  variant: Variant;
  plant: Plant | undefined;
  customerPrice?: number | null;
  added?: boolean;
  onAdd: () => void;
}

/**
 * Search result row in the plant-search full-screen modal.
 *
 *   ┌──────────────────────────────────────────────────────┐
 *   │ [▩▩]  Lantana montevidensis        🏷 €4,50    [ + ] │
 *   │  CODE  H 20–50 CM · P 5L                              │
 *   └──────────────────────────────────────────────────────┘
 *
 * - Plant tile (striped placeholder + monospace SKU)
 * - Italic serif scientific name (Fraunces)
 * - Uppercase monospace size meta
 * - Sage Tag icon when customer-specific price is present
 * - Big circular add button — toggles to a check when already in cart
 *
 * Never displays the raw variant_code.
 */
export default function VariantCard({ variant, plant, customerPrice, added, onAdd }: Props) {
  const name = prettyScientificName(plant?.scientific_name) || fallbackVariantLabel(variant.variant_code);
  const size = cleanSizeSummary(variant.size_summary);

  const price = customerPrice ?? variant.default_sell_price;
  const isCustomerPrice = customerPrice != null;
  const tileLabel = (plant?.scientific_name?.split(/\s+/)[0] ?? variant.variant_code.split('__')[0] ?? 'PLANT')
    .slice(0, 4)
    .toUpperCase();

  return (
    <div
      style={{
        background: '#fff',
        borderRadius: 14,
        padding: 12,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        border: '1px solid rgba(63,75,70,0.06)',
      }}
    >
      <PlantTile label={tileLabel} size={48} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          className="font-display"
          style={{ fontStyle: 'italic', fontSize: 15, fontWeight: 500, color: 'var(--ink-900)' }}
        >
          {name}
        </p>
        {size && (
          <p
            className="font-mono-meta"
            style={{
              fontSize: 10,
              color: 'var(--ink-500)',
              marginTop: 2,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
            }}
          >
            {size}
          </p>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
          {isCustomerPrice && (
            <Tag size={11} color="var(--sage-700)" strokeWidth={1.5} />
          )}
          {price != null ? (
            <span
              className="font-mono-meta"
              style={{
                fontSize: 12,
                fontWeight: 500,
                color: isCustomerPrice ? 'var(--sage-700)' : 'var(--ink-700)',
              }}
            >
              {fmtEUR(price)}
            </span>
          ) : (
            <span
              className="text-eyebrow"
              style={{ fontSize: 9, color: 'var(--ink-300)' }}
            >
              No price
            </span>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={onAdd}
        aria-label={added ? 'Έχει προστεθεί' : 'Προσθήκη'}
        className="ios-tap"
        style={{
          width: 36,
          height: 36,
          borderRadius: 999,
          background: added ? 'var(--sage-100)' : 'var(--sage-700)',
          color: added ? 'var(--sage-700)' : 'var(--cream-50)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {added ? <Check size={16} /> : <Plus size={16} />}
      </button>
    </div>
  );
}

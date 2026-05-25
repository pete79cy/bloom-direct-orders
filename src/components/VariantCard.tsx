import { Plus, Check, Tag } from 'lucide-react';
import {
  pickPlantName,
  sizeDetailsString,
  fallbackVariantLabel,
} from '@/lib/plant-display';
import { fmtEUR } from '@/lib/format';
import PlantTile from './PlantTile';
import type { Plant, Variant } from '@/types';

interface Props {
  variant: Variant;
  plant: Plant | undefined;
  supplier?: string | null;
  customerPrice?: number | null;
  cost?: number | null;
  added?: boolean;
  onAdd: () => void;
}

/**
 * Search-result row.
 *
 *   ┌────────────────────────────────────────────────────────────┐
 *   │ [▩▩]  Γεράνι                              🏷 €4.50    [ + ] │
 *   │       Pelargonium graveolens                                │
 *   │       ΦΥΤΏΡΙΑ ΣΧΟΛΗΣ                                        │
 *   │       P 5L · H 20–50 CM                                     │
 *   └────────────────────────────────────────────────────────────┘
 *
 * Hierarchy:
 *  1. Common name (Greek) — primary. Promotes scientific if missing.
 *  2. Scientific Latin — italic serif, muted, smaller.
 *  3. Supplier — uppercase eyebrow, ink-300, letter-spaced (only if known).
 *  4. Size meta — monospace uppercase ink-500: P 5L · H 20–50 CM · G 8–10 CM.
 *     Heights/girths with min === max === 1 (bloom-crm "unknown" placeholder)
 *     are silently omitted by sizeDetailsString.
 *
 * Never shows the raw variant_code.
 */
export default function VariantCard({
  variant,
  plant,
  supplier,
  customerPrice,
  cost,
  added,
  onAdd,
}: Props) {
  const { primary, secondary } = pickPlantName(plant ?? null);
  const displayPrimary = primary === 'Φυτό' ? fallbackVariantLabel(variant.variant_code) : primary;
  const size = sizeDetailsString({
    pot_volume_l: variant.pot_volume_l,
    height_min_cm: variant.height_min_cm,
    height_max_cm: variant.height_max_cm,
    girth_min_cm: variant.girth_min_cm,
    girth_max_cm: variant.girth_max_cm,
  });

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
        alignItems: 'flex-start',
        gap: 12,
        border: '1px solid rgba(63,75,70,0.06)',
      }}
    >
      <PlantTile label={tileLabel} size={48} />

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Primary — Greek name (or promoted scientific) */}
        <p
          style={{
            fontSize: 15,
            fontWeight: 500,
            color: 'var(--ink-900)',
            lineHeight: 1.25,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {displayPrimary}
        </p>

        {/* Secondary — scientific Latin, italic serif */}
        {secondary && (
          <p
            className="font-display"
            style={{
              fontStyle: 'italic',
              fontSize: 12,
              color: 'var(--ink-500)',
              marginTop: 1,
              lineHeight: 1.3,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {secondary}
          </p>
        )}

        {/* Supplier — eyebrow style, only when known */}
        {supplier && (
          <p
            className="text-eyebrow"
            style={{
              fontSize: 9,
              marginTop: 4,
              color: 'var(--ink-300)',
              letterSpacing: '0.15em',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {supplier}
          </p>
        )}

        {/* Size meta — monospace uppercase */}
        {size && (
          <p
            className="font-mono-meta"
            style={{
              fontSize: 10,
              color: 'var(--ink-500)',
              marginTop: supplier ? 2 : 4,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {size}
          </p>
        )}
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: 8,
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
          {/* Sell price (or "No price") */}
          {price != null ? (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 12,
                fontWeight: 500,
                color: isCustomerPrice ? 'var(--sage-700)' : 'var(--ink-900)',
              }}
              className="font-mono-meta"
              title={isCustomerPrice ? 'Τιμή πελάτη' : 'Default τιμή'}
            >
              {isCustomerPrice && <Tag size={11} color="var(--sage-700)" strokeWidth={1.5} />}
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
          {/* Cost — small, muted, beneath the sell price */}
          {cost != null && (
            <span
              className="font-mono-meta"
              style={{
                fontSize: 10,
                color: 'var(--ink-300)',
                letterSpacing: 0,
              }}
              title="Χαμηλότερο κόστος προμηθευτή"
            >
              {fmtEUR(cost)} cost
            </span>
          )}
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
          }}
        >
          {added ? <Check size={16} /> : <Plus size={16} />}
        </button>
      </div>
    </div>
  );
}

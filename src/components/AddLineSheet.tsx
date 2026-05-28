import { useEffect, useState } from 'react';
import { Plus, Check, X } from 'lucide-react';
import FullScreenSheet from './FullScreenSheet';
import PlantTile from './PlantTile';
import PriceInput from './PriceInput';
import QtyStepper from './QtyStepper';
import VatPicker from './VatPicker';
import {
  pickPlantName,
  sizeDetailsString,
  fallbackVariantLabel,
} from '@/lib/plant-display';
import { fmtEUR } from '@/lib/format';
import { DEFAULT_VAT_RATE, VAT_LABEL, type VatRate } from '@/lib/vat';
import type { Plant, Variant } from '@/types';

export interface AddLineResult {
  qty: number;
  unit_price: number;
  vat_rate: VatRate;
  /** True when the user manually typed a number that differs from the
   *  initial default. The wizard uses this to label the price source. */
  priceOverridden: boolean;
  /** Per-line free-text note ("Χωρίς γλάστρα", "Ύψος 80cm+"). Empty
   *  string when the user didn't type anything. */
  description: string;
}

interface Props {
  open: boolean;
  variant: Variant | null;
  plant: Plant | undefined;
  supplier?: string | null;
  /** Pre-fill: cheapest current supplier cost — read-only reference. */
  cost?: number | null;
  /** Pre-fill: customer-specific price if known. Otherwise variant default. */
  customerPrice?: number | null;
  onClose: () => void;
  onAdd: (result: AddLineResult) => void;
}

/**
 * Full-screen "Configure line" sheet.
 *
 *   ┌────────────────────────────────────────┐
 *   │ [×]   Διέτης                           │
 *   │       Dietes bicolor                   │
 *   │       P 5L · ΦΥΤΏΡΙΑ ΣΟΛΟΜΟΥ           │
 *   ├────────────────────────────────────────┤
 *   │ ΚΌΣΤΟΣ ΑΝΑΦΟΡΆΣ                        │
 *   │ €2.50                                   │
 *   │                                         │
 *   │ ΤΙΜΉ ΠΏΛΗΣΗΣ                            │
 *   │ €  [ 4.50         ]                     │
 *   │                                         │
 *   │ ΠΟΣΌΤΗΤΑ                                │
 *   │ [−] [   6   ] [+]                       │
 *   │                                         │
 *   │ ΦΠΑ                                     │
 *   │ [ 5% ]  [✓ 19% ]                        │
 *   │                                         │
 *   │ ─────────────────────────────────────── │
 *   │ Σύνολο γραμμής                          │
 *   │ 6 × €4.50 = €27.00                      │
 *   │ + ΦΠΑ 19%   €5.13                       │
 *   │ ─────────────────────────────────────── │
 *   │ Σύνολο       €32.13                     │
 *   ├────────────────────────────────────────┤
 *   │ [    Προσθήκη στην παραγγελία    ]      │
 *   └────────────────────────────────────────┘
 *
 * Stacks above the plant-search sheet at zIndex 1400 (vs 1300) — when the
 * user dismisses (× or after add), control returns to the search list with
 * the previous query preserved.
 */
export default function AddLineSheet({
  open,
  variant,
  plant,
  supplier,
  cost,
  customerPrice,
  onClose,
  onAdd,
}: Props) {
  // Defaults flow into state when the sheet opens for a new variant.
  // We track the initial price so we can detect overrides on commit.
  const [qty, setQty] = useState(1);
  const [unitPrice, setUnitPrice] = useState(0);
  const [vatRate, setVatRate] = useState<VatRate>(DEFAULT_VAT_RATE);
  const [initialPrice, setInitialPrice] = useState(0);
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (!open || !variant) return;
    const seed = customerPrice ?? variant.default_sell_price ?? 0;
    setQty(1);
    setUnitPrice(seed);
    setVatRate(DEFAULT_VAT_RATE);
    setInitialPrice(seed);
    setDescription('');
  }, [open, variant, customerPrice]);

  if (!variant) return null;

  const { primary, secondary } = pickPlantName(plant ?? null);
  const displayPrimary = primary === 'Φυτό'
    ? fallbackVariantLabel(variant.variant_code)
    : primary;
  const size = sizeDetailsString({
    pot_volume_l: variant.pot_volume_l,
    height_min_cm: variant.height_min_cm,
    height_max_cm: variant.height_max_cm,
    girth_min_cm: variant.girth_min_cm,
    girth_max_cm: variant.girth_max_cm,
  });
  const tileLabel = (plant?.scientific_name?.split(/\s+/)[0]
    ?? variant.variant_code.split('__')[0]
    ?? 'PLNT').slice(0, 4).toUpperCase();

  // Live subtotal breakdown
  const net = qty * unitPrice;
  const vatAmount = net * (vatRate / 100);
  const gross = net + vatAmount;

  const canAdd = unitPrice >= 0 && qty > 0;

  function commit() {
    if (!canAdd) return;
    onAdd({
      qty,
      unit_price: unitPrice,
      vat_rate: vatRate,
      priceOverridden: Math.abs(unitPrice - initialPrice) > 0.0001,
      description: description.trim(),
    });
  }

  return (
    <FullScreenSheet open={open} onClose={onClose}>
      {/* Header */}
      <div
        className="pt-safe"
        style={{
          padding: '14px 16px 14px',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 12,
          borderBottom: '1px solid rgba(63,75,70,0.06)',
        }}
      >
        <button
          type="button"
          aria-label="Κλείσιμο"
          onClick={onClose}
          className="ios-tap"
          style={{
            width: 36, height: 36, borderRadius: 999,
            background: 'rgba(63,75,70,0.06)',
            color: 'var(--ink-700)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <X size={16} strokeWidth={1.8} />
        </button>
        <PlantTile label={tileLabel} size={44} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p
            style={{
              fontSize: 16, fontWeight: 500, color: 'var(--ink-900)',
              lineHeight: 1.25, overflow: 'hidden',
              textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}
          >
            {displayPrimary}
          </p>
          {secondary && (
            <p
              className="font-display"
              style={{
                fontStyle: 'italic', fontSize: 12, color: 'var(--ink-500)',
                marginTop: 1, lineHeight: 1.3,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}
            >
              {secondary}
            </p>
          )}
          {(supplier || size) && (
            <p
              className="font-mono-meta"
              style={{
                fontSize: 10, color: 'var(--ink-500)', marginTop: 4,
                letterSpacing: '0.05em', textTransform: 'uppercase',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}
            >
              {[supplier, size].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
      </div>

      {/* Form */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 20px 24px' }}>
        {/* Cost reference */}
        <div style={{ marginBottom: 20 }}>
          <div className="text-eyebrow" style={{ fontSize: 9, marginBottom: 6 }}>
            Κόστος αναφοράς
          </div>
          {cost != null ? (
            <p
              className="font-mono-meta"
              style={{ fontSize: 16, fontWeight: 500, color: 'var(--ink-700)' }}
            >
              {fmtEUR(cost)}
            </p>
          ) : (
            <p
              style={{
                fontSize: 14, color: 'var(--ink-300)',
                fontFamily: 'var(--font-mono)',
              }}
            >
              —
            </p>
          )}
        </div>

        {/* Sell price input */}
        <div style={{ marginBottom: 20 }}>
          <div className="text-eyebrow" style={{ fontSize: 9, marginBottom: 6 }}>
            Τιμή πώλησης
          </div>
          <PriceInput
            value={unitPrice}
            onChange={setUnitPrice}
            warn={cost != null && unitPrice > 0 && unitPrice < cost}
          />
          {cost != null && unitPrice > 0 && (() => {
            const margin = ((unitPrice - cost) / cost) * 100;
            const color = margin < 0
              ? 'var(--accent-clay)'
              : margin < 15
                ? 'var(--honey)'
                : 'var(--sage-600)';
            return (
              <p
                className="font-mono-meta"
                style={{ fontSize: 11, color, marginTop: 6, fontWeight: 500 }}
              >
                {margin >= 0 ? '+' : ''}{margin.toFixed(0)}% margin
              </p>
            );
          })()}
        </div>

        {/* Qty */}
        <div style={{ marginBottom: 20 }}>
          <div className="text-eyebrow" style={{ fontSize: 9, marginBottom: 6 }}>
            Ποσότητα
          </div>
          <QtyStepper value={qty} min={1} onChange={setQty} />
        </div>

        {/* Per-line note — kept optional + visually subtle so it doesn't
            slow down the speed-of-add flow when the user has nothing to say.
            Maps to order_lines.description on submit. */}
        <div style={{ marginBottom: 20 }}>
          <div
            className="text-eyebrow"
            style={{
              fontSize: 9, marginBottom: 6,
              display: 'flex', justifyContent: 'space-between',
            }}
          >
            <span>Σημείωση</span>
            <span style={{ color: 'var(--ink-300)', letterSpacing: 0, textTransform: 'none', fontSize: 10 }}>
              προαιρετικό
            </span>
          </div>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="π.χ. χωρίς γλάστρα, ύψος 80cm+, ανθισμένα μόνο…"
            rows={2}
            style={{
              width: '100%',
              padding: '10px 12px',
              background: 'rgba(255,255,255,0.85)',
              border: '1px solid rgba(63,75,70,0.10)',
              borderRadius: 12,
              fontSize: 14,
              color: 'var(--ink-900)',
              outline: 'none',
              resize: 'none',
              fontFamily: 'inherit',
              lineHeight: 1.4,
            }}
          />
        </div>

        {/* VAT */}
        <div style={{ marginBottom: 24 }}>
          <div className="text-eyebrow" style={{ fontSize: 9, marginBottom: 6 }}>
            ΦΠΑ
          </div>
          <VatPicker value={vatRate} onChange={setVatRate} />
        </div>

        {/* Subtotal preview */}
        <div
          style={{
            background: 'var(--cream-200)',
            borderRadius: 14,
            padding: 14,
          }}
        >
          <div className="text-eyebrow" style={{ fontSize: 9, marginBottom: 10 }}>
            Σύνολο γραμμής
          </div>

          <Row
            label={
              <span className="font-mono-meta" style={{ fontSize: 12, color: 'var(--ink-500)' }}>
                {qty} × {fmtEUR(unitPrice)}
              </span>
            }
            value={fmtEUR(net)}
            valueColor="var(--ink-700)"
            small
          />

          <Row
            label={
              <span style={{ fontSize: 12, color: 'var(--ink-500)' }}>
                {VAT_LABEL[vatRate]}
              </span>
            }
            value={fmtEUR(vatAmount)}
            valueColor="var(--ink-700)"
            small
          />

          <div className="hairline" style={{ margin: '10px 0 8px' }} />

          <Row
            label={
              <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--sage-800)' }}>
                Σύνολο
              </span>
            }
            value={fmtEUR(gross)}
            valueColor="var(--sage-800)"
            big
          />
        </div>
      </div>

      {/* Commit bar */}
      <div
        className="pb-safe"
        style={{
          padding: '14px 20px 16px',
          background: '#fff',
          borderTop: '1px solid rgba(63,75,70,0.10)',
        }}
      >
        <button
          type="button"
          disabled={!canAdd}
          onClick={commit}
          className="btn-primary ios-tap"
        >
          <Plus size={18} color="var(--cream-50)" strokeWidth={2} />
          Προσθήκη στην παραγγελία
          <Check size={0} aria-hidden="true" />
        </button>
      </div>
    </FullScreenSheet>
  );
}

function Row({
  label,
  value,
  valueColor,
  small,
  big,
}: {
  label: React.ReactNode;
  value: string;
  valueColor: string;
  small?: boolean;
  big?: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        marginBottom: small ? 4 : 0,
      }}
    >
      {label}
      <span
        className="font-mono-meta"
        style={{
          fontSize: big ? 18 : 13,
          fontWeight: big ? 500 : 400,
          color: valueColor,
        }}
      >
        {value}
      </span>
    </div>
  );
}

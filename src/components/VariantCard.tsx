import { Plus } from 'lucide-react';
import { prettyScientificName, cleanSizeSummary, fallbackVariantLabel } from '@/lib/plant-display';
import { fmtEUR } from '@/lib/format';
import type { Plant, Variant } from '@/types';

interface Props {
  variant: Variant;
  plant: Plant | undefined;
  customerPrice?: number | null;   // present when this customer has a contracted price
  onAdd: () => void;
}

/**
 * Result row in the "Προσθήκη γραμμής" sheet — designed for two-line glance:
 *
 *   ┌──────────────────────────────────────────────────────┐
 *   │ ❡  Lantana montevidensis              €4,50  +     │   ← scientific + price + tap
 *   │     H 20–50 cm · P 5L                              │   ← size summary (cleaned)
 *   └──────────────────────────────────────────────────────┘
 *
 * Never shows the raw `variant_code` — those are machine identifiers,
 * not human labels.
 */
export default function VariantCard({ variant, plant, customerPrice, onAdd }: Props) {
  const name = prettyScientificName(plant?.scientific_name) || fallbackVariantLabel(variant.variant_code);
  const size = cleanSizeSummary(variant.size_summary);
  const commonName = plant?.common_name?.trim();

  const price = customerPrice ?? variant.default_sell_price;
  const priceKind: 'customer' | 'default' | 'none' =
    customerPrice != null ? 'customer' : variant.default_sell_price != null ? 'default' : 'none';

  return (
    <button
      type="button"
      onClick={onAdd}
      className="ios-tap group w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-sage-50/60 active:bg-sage-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sage-400/40 rounded-lg transition-colors"
    >
      {/* Botanical glyph — subtle, leaves room for everything else */}
      <span className="mt-0.5 text-sage-400 flex-shrink-0" aria-hidden="true">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path
            d="M8 14 V8 M8 8 C 5 8 3 6.5 2.5 3.5 C 5 3.5 7 5 8 8 Z M8 7 C 11 7 13 5.5 13.5 2.5 C 11 2.5 9 4 8 7 Z"
            fill="currentColor"
            opacity="0.75"
          />
        </svg>
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-[15px] leading-snug">
          <span className="font-display italic text-ink-900 text-[16px] tracking-tight">{name}</span>
          {commonName && (
            <span className="ml-1.5 text-ink-500 text-[13px] font-normal">— {commonName}</span>
          )}
        </p>
        {size && (
          <p className="mt-0.5 text-xs text-ink-500 tabular-nums tracking-wide">{size}</p>
        )}
      </div>

      <div className="flex flex-col items-end shrink-0 gap-1">
        {price != null ? (
          <span
            className={
              'text-sm font-medium tabular-nums ' +
              (priceKind === 'customer' ? 'text-sage-600' : 'text-ink-700')
            }
            title={priceKind === 'customer' ? 'Τιμή πελάτη' : 'Default τιμή'}
          >
            {fmtEUR(price)}
          </span>
        ) : (
          <span className="text-[11px] text-ink-300 uppercase tracking-wider">no price</span>
        )}
        <span
          className="w-7 h-7 rounded-full bg-sage-50 group-active:bg-sage-100 flex items-center justify-center text-sage-600 transition-colors"
          aria-hidden="true"
        >
          <Plus className="w-4 h-4" strokeWidth={2.25} />
        </span>
      </div>
    </button>
  );
}

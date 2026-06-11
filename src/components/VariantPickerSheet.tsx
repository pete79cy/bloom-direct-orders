import { useMemo, useState } from 'react';
import { X, Search } from 'lucide-react';
import { useVariants, usePlants } from '@/lib/queries';
import { pickPlantName, sizeDetailsString, fallbackVariantLabel } from '@/lib/plant-display';
import { normalizeForSearch } from '@/lib/search';
import type { Plant, Variant } from '@/types';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Variant ids that are already in the order — we hide them or mark
   *  them so the operator can't accidentally pick a duplicate. */
  excludeVariantIds?: string[];
  onPick: (variant: Variant, plant: Plant | undefined) => void;
}

/**
 * Compact full-screen variant picker. Used by OrderDetail's inline edit
 * flow when the operator taps "+ Νέα γραμμή" — selecting a variant here
 * then hands off to the existing AddLineSheet for qty/price/vat.
 *
 * Mirrors the search behaviour of NewOrderWizard's Step 2 (Greek + Latin
 * + size + variant code matching) but in a leaner standalone sheet so
 * we don't have to refactor the wizard to be re-entrant.
 */
export default function VariantPickerSheet({ open, onClose, excludeVariantIds = [], onPick }: Props) {
  const [query, setQuery] = useState('');
  const { data: variants = [] } = useVariants();
  const { data: plants = [] } = usePlants();

  const excludeSet = useMemo(() => new Set(excludeVariantIds), [excludeVariantIds]);

  const enriched = useMemo(
    () =>
      variants.map((v) => {
        const plant = plants.find((p) => p.id === v.plant_id);
        const { primary, secondary } = pickPlantName(plant ?? null);
        const size = sizeDetailsString({
          pot_volume_l: v.pot_volume_l,
          height_min_cm: v.height_min_cm,
          height_max_cm: v.height_max_cm,
          girth_min_cm: v.girth_min_cm,
          girth_max_cm: v.girth_max_cm,
        }) ?? '';
        const display = primary === 'Φυτό' ? fallbackVariantLabel(v.variant_code) : primary;
        // Pre-normalised so per-keystroke filter is a plain substring check.
        const searchBlob = normalizeForSearch(
          `${primary} ${secondary ?? ''} ${plant?.common_name ?? ''} ${v.variant_code} ${size}`,
        );
        return { variant: v, plant, display, secondary, size, searchBlob };
      }),
    [variants, plants],
  );

  const filtered = useMemo(() => {
    const q = normalizeForSearch(query.trim());
    const base = q ? enriched.filter((e) => e.searchBlob.includes(q)) : enriched;
    const sorted = [...base].sort((a, b) => {
      const aDraft = a.variant.status === 'draft' ? 1 : 0;
      const bDraft = b.variant.status === 'draft' ? 1 : 0;
      return aDraft - bDraft;
    });
    return sorted.slice(0, 60);
  }, [enriched, query]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Επιλογή φυτού"
      style={{
        position: 'fixed', inset: 0, zIndex: 1300,
        background: 'var(--cream-100, #FBFAF6)',
        display: 'flex', flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: 'calc(env(safe-area-inset-top,0px) + 14px) 16px 10px',
          display: 'flex', alignItems: 'center', gap: 10,
          borderBottom: '1px solid rgba(63,75,70,0.08)',
          background: '#fff',
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Κλείσιμο"
          className="ios-tap"
          style={{
            width: 36, height: 36, borderRadius: 999, border: 0,
            background: 'transparent',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--ink-700)', cursor: 'pointer',
          }}
        >
          <X size={20} />
        </button>
        <div
          className="font-display"
          style={{
            fontSize: 18,
            fontWeight: 500,
            fontStyle: 'italic',
            color: 'var(--ink-900)',
            flex: 1,
          }}
        >
          Νέα γραμμή
        </div>
      </div>

      {/* Search */}
      <div style={{ padding: '14px 16px', position: 'relative', background: '#fff' }}>
        <Search
          style={{ position: 'absolute', left: 30, top: 28, color: 'var(--ink-500)' }}
          size={16}
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Αναζήτηση φυτού / κωδικού"
          autoFocus
          style={{
            width: '100%', height: 44, paddingLeft: 38, paddingRight: 14,
            background: 'var(--cream-200, #F4F1E8)',
            border: '1px solid rgba(63,75,70,0.10)',
            borderRadius: 12, fontSize: 15, outline: 'none',
          }}
        />
      </div>

      {/* Results */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 16px 24px' }}>
        {filtered.length === 0 && (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--ink-500)', fontSize: 14 }}>
            {query ? 'Καμία αντιστοίχιση.' : 'Πληκτρολόγησε για αναζήτηση.'}
          </div>
        )}
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {filtered.map((e) => {
            const inOrder = excludeSet.has(e.variant.id);
            return (
              <li
                key={e.variant.id}
                style={{
                  background: '#fff',
                  borderRadius: 12,
                  marginBottom: 8,
                  boxShadow: 'var(--shadow-card)',
                  opacity: inOrder ? 0.5 : 1,
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    if (inOrder) return;
                    onPick(e.variant, e.plant);
                  }}
                  disabled={inOrder}
                  className="ios-tap"
                  style={{
                    width: '100%', padding: '12px 14px',
                    background: 'transparent', border: 0, cursor: inOrder ? 'default' : 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink-900)' }}>
                    {e.display}
                  </div>
                  {e.secondary && (
                    <div
                      style={{
                        fontStyle: 'italic',
                        fontSize: 12,
                        color: 'var(--ink-500)',
                        marginTop: 2,
                      }}
                    >
                      {e.secondary}
                    </div>
                  )}
                  <div
                    className="font-mono-meta"
                    style={{
                      fontSize: 10,
                      color: 'var(--ink-500)',
                      marginTop: 4,
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                    }}
                  >
                    {e.size || e.variant.variant_code}
                    {inOrder && ' · ΗΔΗ ΣΤΗΝ ΠΑΡΑΓΓΕΛΙΑ'}
                    {e.variant.status === 'draft' && ' · ΠΡΟΧΕΙΡΟ'}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

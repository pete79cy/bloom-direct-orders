import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Check, FileText, Loader2, Plus, Search, ShoppingCart, Sparkles, X } from 'lucide-react';
import CustomerFormField from '@/components/CustomerFormField';
import PriceInput from '@/components/PriceInput';
import VatPicker from '@/components/VatPicker';
import {
  lookupBotanicalName, useCreateProduct, useCreateVariant, usePlants, useVariants,
} from '@/lib/queries';
import {
  COMMON_POT_SIZES_L, EMPTY_PRODUCT_FORM, PLANT_TYPE_LABEL, PRODUCT_KIND_LABEL, botanicalCandidates,
  buildPlantBody, buildVariantBody, describeProductSize, validateProductForm, validateSubproductForm,
  type NewProductForm, type PlantType, type ProductKind,
} from '@/lib/new-product';
import { fmtEUR } from '@/lib/format';
import { pickPlantName, sizeDetailsString, fallbackVariantLabel } from '@/lib/plant-display';
import { normalizeForSearch } from '@/lib/search';
import type { DuplicateSeed } from '@/pages/NewOrderWizard';
import type { Plant, Variant } from '@/types';

export type AddProductMode = 'product' | 'subproduct';

/**
 * «Νέο προϊόν» / «Νέο υποπροϊόν» — add to the catalogue from the phone in
 * under a minute.
 *
 * product:    Greek name first, pot size as tap chips, everything else
 *             optional. Saves through the same two Bloom endpoints the
 *             desktop "New Product" dialog uses (plant, then variant).
 * subproduct: pick an existing product, see the sizes it already has, add
 *             one more (the desktop "New Subproduct" — variant only).
 *
 * Both end on a card that offers to start an order or quote with the new
 * line already in.
 */
export default function AddProductPage({ mode = 'product' }: { mode?: AddProductMode }) {
  const navigate = useNavigate();
  const createProduct = useCreateProduct();
  const createVariant = useCreateVariant();
  const sub = mode === 'subproduct';
  const { data: plants = [] } = usePlants();
  const { data: variants = [] } = useVariants();

  const [form, setForm] = useState<NewProductForm>(EMPTY_PRODUCT_FORM);
  const [parent, setParent] = useState<Plant | null>(null);
  const [more, setMore] = useState(false);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [created, setCreated] = useState<{ variantId: string; name: string; botanical: string | null } | null>(null);

  const set = <K extends keyof NewProductForm>(k: K, v: NewProductForm[K]) => setForm((f) => ({ ...f, [k]: v }));
  const setAttr = <K extends keyof NewProductForm['attributes']>(k: K, v: NewProductForm['attributes'][K]) =>
    setForm((f) => ({ ...f, attributes: { ...f.attributes, [k]: v } }));

  // Sizes the chosen product already has — shown so the user doesn't re-add
  // one, and used to refuse an exact duplicate before the round trip.
  const siblings = useMemo(
    () => (parent ? variants.filter((v) => v.plant_id === parent.id) : []),
    [variants, parent],
  );
  const kind: ProductKind = sub ? (parent?.product_kind ?? 'plant') : form.kind;
  const isPlant = kind === 'plant';
  const problem = sub
    ? validateSubproductForm(form, parent, siblings.map((v) => v.variant_code))
    : validateProductForm(form);
  const saving = createProduct.isPending || createVariant.isPending;

  async function onLookup() {
    const q = form.commonName.trim();
    if (q.length < 2) return;
    setLookupBusy(true);
    try {
      const res = await lookupBotanicalName(q);
      const names = botanicalCandidates(res);
      if (names.length === 0) {
        toast.message('Δεν βρέθηκε βοτανικό όνομα — γράψτε το ή αφήστε το κενό.');
      } else if (names.length === 1 || (res.result?.primary?.confidence ?? 0) >= 80) {
        set('scientificName', names[0]);
        setSuggestions(names.slice(1));
      } else {
        setSuggestions(names);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Η αναζήτηση απέτυχε');
    } finally {
      setLookupBusy(false);
    }
  }

  async function onSave() {
    if (problem) {
      toast.error(problem);
      return;
    }
    try {
      if (sub && parent) {
        const v = await createVariant.mutateAsync({ plantId: parent.id, variant: buildVariantBody(form, parent) });
        const n = pickPlantName(parent);
        setCreated({ variantId: v.id, name: n.primary, botanical: n.secondary });
        toast.success('Το μέγεθος προστέθηκε στο προϊόν');
      } else {
        const res = await createProduct.mutateAsync({ plant: buildPlantBody(form), variant: buildVariantBody(form) });
        setCreated({ variantId: res.variant.id, name: form.commonName.trim(), botanical: form.scientificName.trim() || null });
        toast.success('Το προϊόν προστέθηκε στον κατάλογο');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Αποτυχία δημιουργίας');
    }
  }

  function startWith(path: '/orders/new' | '/quotes/new') {
    if (!created) return;
    const seed: DuplicateSeed = {
      customer: null,
      lines: [{ variant_id: created.variantId, qty: 1, unit_price: form.unitPrice, vat_rate: form.vatRate, description: '' }],
    };
    navigate(path, { state: { duplicate: seed } });
  }

  function reset(keepParent: boolean) {
    setForm(EMPTY_PRODUCT_FORM);
    setSuggestions([]);
    setCreated(null);
    if (!keepParent) setParent(null);
  }

  const title = sub ? 'Νέο υποπροϊόν' : 'Νέο προϊόν';
  const sizeLine = describeProductSize(form, kind);

  return (
    <div className="min-h-screen" style={{ background: 'var(--cream-100)', display: 'flex', flexDirection: 'column' }}>
      <header className="pt-safe" style={{ padding: '14px 20px 8px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="Πίσω"
          className="ios-tap"
          style={{
            width: 36, height: 36, marginLeft: -8, borderRadius: 999,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-700)',
          }}
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <div className="text-eyebrow">Κατάλογος</div>
          <h1 className="font-display" style={{ fontSize: 24, lineHeight: 1.05, color: 'var(--ink-900)', fontWeight: 500, marginTop: 2 }}>
            {created ? 'Προστέθηκε' : title}
          </h1>
        </div>
      </header>

      {created ? (
        <div style={{ flex: 1, padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ background: '#fff', borderRadius: 16, boxShadow: 'var(--shadow-card)', padding: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              aria-hidden="true"
              style={{
                width: 44, height: 44, borderRadius: 999, flexShrink: 0,
                background: 'var(--sage-100, #E6EEE2)', color: 'var(--sage-800)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Check size={22} strokeWidth={2.4} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink-900)' }}>{created.name}</div>
              {created.botanical && (
                <div className="font-display" style={{ fontStyle: 'italic', fontSize: 13, color: 'var(--ink-500)' }}>{created.botanical}</div>
              )}
              <div className="font-mono-meta" style={{ fontSize: 12, color: 'var(--ink-500)', marginTop: 2 }}>
                {[sizeLine, form.unitPrice > 0 ? fmtEUR(form.unitPrice) : null].filter(Boolean).join(' · ') || PRODUCT_KIND_LABEL[kind]}
              </div>
            </div>
          </div>

          <p style={{ fontSize: 13, color: 'var(--ink-500)', lineHeight: 1.45, margin: 0 }}>
            Είναι ήδη διαθέσιμο στην αναζήτηση φυτών. Η τιμή που δώσατε θα προταθεί στην πρώτη γραμμή που θα το χρησιμοποιήσει.
          </p>

          <button type="button" onClick={() => startWith('/orders/new')} className="btn-primary ios-tap" style={{ height: 54, fontSize: 16 }}>
            <ShoppingCart size={18} color="var(--cream-50)" strokeWidth={2} />
            Νέα παραγγελία με αυτό
          </button>
          <button type="button" onClick={() => startWith('/quotes/new')} className="btn-secondary ios-tap" style={{ height: 48 }}>
            <FileText size={16} color="var(--sage-700)" strokeWidth={1.75} />
            Νέα προσφορά με αυτό
          </button>
          <button
            type="button"
            onClick={() => reset(sub)}
            className="ios-tap"
            style={{ height: 44, color: 'var(--sage-800)', fontSize: 15, fontWeight: 500, background: 'transparent' }}
          >
            <Plus size={16} style={{ display: 'inline', verticalAlign: -3, marginRight: 6 }} />
            {sub ? 'Και άλλο μέγεθος' : 'Και άλλο προϊόν'}
          </button>
          <button type="button" onClick={() => navigate('/')} className="ios-tap" style={{ height: 44, color: 'var(--ink-500)', fontSize: 15, background: 'transparent' }}>
            Τέλος
          </button>
        </div>
      ) : (
        <>
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px 24px' }}>
            {sub ? (
              <ParentPicker plants={plants} value={parent} onChange={(p) => { setParent(p); setForm((f) => ({ ...EMPTY_PRODUCT_FORM, unitPrice: f.unitPrice, vatRate: f.vatRate })); }} siblings={siblings} />
            ) : (
              <>
                <Segmented<ProductKind>
                  value={form.kind}
                  options={(['plant', 'pot', 'other'] as ProductKind[]).map((k) => ({ value: k, label: PRODUCT_KIND_LABEL[k] }))}
                  onChange={(k) => set('kind', k)}
                />
                <div style={{ height: 18 }} />
                <CustomerFormField
                  label={isPlant ? 'Όνομα φυτού' : 'Όνομα προϊόντος'}
                  required
                  value={form.commonName}
                  onChange={(v) => set('commonName', v)}
                  placeholder={isPlant ? 'π.χ. Λεβάντα' : 'π.χ. Γλάστρα τερακότα'}
                  autoFocus
                />
                {isPlant && (
                  <Field label="Βοτανικό όνομα" hint="προαιρετικό">
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        type="text"
                        value={form.scientificName}
                        onChange={(e) => set('scientificName', e.target.value)}
                        placeholder="π.χ. Lavandula angustifolia"
                        autoCapitalize="none"
                        style={{
                          flex: 1, minWidth: 0, height: 46, padding: '0 14px', background: '#fff', fontStyle: form.scientificName ? 'italic' : 'normal',
                          border: '1px solid rgba(63,75,70,0.12)', borderRadius: 12, fontSize: 16, outline: 'none',
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => void onLookup()}
                        disabled={lookupBusy || form.commonName.trim().length < 2}
                        aria-label="Εύρεση βοτανικού ονόματος"
                        className="ios-tap"
                        style={{
                          width: 46, height: 46, borderRadius: 12, flexShrink: 0,
                          background: '#fff', border: '1px solid rgba(63,75,70,0.14)', color: 'var(--sage-700)',
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          opacity: lookupBusy || form.commonName.trim().length < 2 ? 0.5 : 1,
                        }}
                      >
                        {lookupBusy ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
                      </button>
                    </div>
                    {suggestions.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                        {suggestions.map((s) => (
                          <Chip key={s} active={false} onClick={() => { set('scientificName', s); setSuggestions([]); }}>
                            <span style={{ fontStyle: 'italic' }}>{s}</span>
                          </Chip>
                        ))}
                      </div>
                    )}
                  </Field>
                )}
              </>
            )}

            {(!sub || parent) && (
              <>
                {isPlant ? (
                  <>
                    <Field label="Γλάστρα" required>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {COMMON_POT_SIZES_L.map((l) => (
                          <Chip key={l} active={form.potVolumeL === l} onClick={() => set('potVolumeL', l)}>{l}L</Chip>
                        ))}
                        <label
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4, height: 36, padding: '0 10px', borderRadius: 999,
                            background: '#fff', border: '1px solid rgba(63,75,70,0.14)',
                          }}
                        >
                          <input
                            type="number"
                            inputMode="decimal"
                            min="0"
                            step="0.5"
                            aria-label="Άλλο μέγεθος γλάστρας (λίτρα)"
                            placeholder="άλλο"
                            value={form.potVolumeL != null && !COMMON_POT_SIZES_L.includes(form.potVolumeL) ? form.potVolumeL : ''}
                            onChange={(e) => {
                              const n = Number.parseFloat(e.target.value.replace(',', '.'));
                              set('potVolumeL', Number.isFinite(n) && n > 0 ? n : null);
                            }}
                            className="font-mono-meta"
                            style={{ width: 48, border: 0, outline: 'none', background: 'transparent', fontSize: 14, textAlign: 'center' }}
                          />
                          <span style={{ fontSize: 13, color: 'var(--ink-500)' }}>L</span>
                        </label>
                      </div>
                    </Field>
                    <Field label="Ύψος (cm)" hint="προαιρετικό">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <NumberBox label="Ύψος από" value={form.heightMinCm} onChange={(n) => set('heightMinCm', n)} placeholder="από" />
                        <span style={{ color: 'var(--ink-300)' }}>–</span>
                        <NumberBox label="Ύψος έως" value={form.heightMaxCm} onChange={(n) => set('heightMaxCm', n)} placeholder="έως" />
                      </div>
                    </Field>
                  </>
                ) : (
                  <Field label="Χαρακτηριστικά" hint="προαιρετικό">
                    <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                      <NumberBox label="Διάμετρος (cm)" value={form.attributes.diameter_cm} onChange={(n) => setAttr('diameter_cm', n)} placeholder="Ø cm" />
                      <NumberBox label="Ύψος (cm)" value={form.attributes.height_cm} onChange={(n) => setAttr('height_cm', n)} placeholder="ύψος cm" />
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <TextBox label="Υλικό" value={form.attributes.material} onChange={(v) => setAttr('material', v)} placeholder="υλικό" />
                      <TextBox label="Χρώμα" value={form.attributes.color} onChange={(v) => setAttr('color', v)} placeholder="χρώμα" />
                    </div>
                  </Field>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'end', marginBottom: 16 }}>
                  <Field label="Τιμή πώλησης" hint="προαιρετικό" compact>
                    <PriceInput value={form.unitPrice} onChange={(n) => set('unitPrice', n)} />
                  </Field>
                  <Field label="ΦΠΑ" compact>
                    <VatPicker value={form.vatRate} onChange={(r) => set('vatRate', r)} />
                  </Field>
                </div>

                {isPlant && !more && (
                  <button type="button" onClick={() => setMore(true)} style={{ fontSize: 14, color: 'var(--sage-700)', fontWeight: 500, background: 'transparent', padding: '4px 0' }}>
                    Περισσότερα (τύπος φυτού{sub ? '' : ', σημείωση'})
                  </button>
                )}
                {(more || !isPlant) && (
                  <>
                    {isPlant && (
                      <Field label="Τύπος φυτού">
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {(Object.keys(PLANT_TYPE_LABEL) as PlantType[]).map((t) => (
                            <Chip key={t} active={form.plantType === t} onClick={() => set('plantType', t)}>{PLANT_TYPE_LABEL[t]}</Chip>
                          ))}
                        </div>
                      </Field>
                    )}
                    {!sub && (
                      <CustomerFormField label="Σημείωση" value={form.notes} onChange={(v) => set('notes', v)} placeholder="π.χ. μόνο κατόπιν παραγγελίας" />
                    )}
                  </>
                )}
              </>
            )}
          </div>

          <div className="pb-safe" style={{ padding: '14px 20px 16px', background: '#fff', borderTop: '1px solid rgba(63,75,70,0.10)' }}>
            {problem && (sub ? !!parent : form.commonName.trim().length >= 2) && (
              <p style={{ fontSize: 12, color: 'var(--ink-500)', margin: '0 0 8px', textAlign: 'center' }}>{problem}</p>
            )}
            <button type="button" disabled={!!problem || saving} onClick={() => void onSave()} className="btn-primary ios-tap">
              {saving ? (
                <>
                  <Loader2 size={16} color="var(--cream-50)" className="animate-spin" />
                  Αποθήκευση…
                </>
              ) : sub ? 'Αποθήκευση μεγέθους' : 'Αποθήκευση προϊόντος'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/** Search-as-you-type over the catalogue's products (not sizes); once one
 *  is picked it shows as a card with the sizes it already has. */
function ParentPicker({
  plants, value, onChange, siblings,
}: { plants: Plant[]; value: Plant | null; onChange: (p: Plant | null) => void; siblings: Variant[] }) {
  const [query, setQuery] = useState('');
  const q = normalizeForSearch(query.trim());
  const hits = useMemo(() => {
    if (q.length < 2) return [];
    return plants
      .filter((p) => normalizeForSearch(`${p.common_name ?? ''} ${p.scientific_name}`).includes(q))
      .slice(0, 8);
  }, [plants, q]);

  if (value) {
    const n = pickPlantName(value);
    return (
      <Field label="Προϊόν" required>
        <div style={{ background: '#fff', borderRadius: 14, boxShadow: 'var(--shadow-card)', padding: '12px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink-900)' }}>{n.primary}</div>
              {n.secondary && <div className="font-display" style={{ fontStyle: 'italic', fontSize: 13, color: 'var(--ink-500)' }}>{n.secondary}</div>}
            </div>
            <button
              type="button"
              onClick={() => onChange(null)}
              aria-label="Αλλαγή προϊόντος"
              className="ios-tap"
              style={{ width: 32, height: 32, borderRadius: 999, background: 'var(--cream-200)', color: 'var(--ink-700)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <X size={16} />
            </button>
          </div>
          <div className="hairline" style={{ margin: '10px 0 8px' }} />
          <div className="text-eyebrow" style={{ fontSize: 9, color: 'var(--ink-500)', marginBottom: 6 }}>
            {siblings.length === 0 ? 'Χωρίς μεγέθη ακόμα' : `Υπάρχοντα μεγέθη (${siblings.length})`}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {siblings.map((v) => (
              <span key={v.id} className="font-mono-meta" style={{ fontSize: 11, padding: '4px 8px', borderRadius: 8, background: 'var(--cream-200)', color: 'var(--ink-700)' }}>
                {sizeDetailsString(v) ?? fallbackVariantLabel(v.variant_code)}
              </span>
            ))}
          </div>
        </div>
      </Field>
    );
  }

  return (
    <Field label="Προϊόν" required>
      <div style={{ position: 'relative' }}>
        <Search size={16} style={{ position: 'absolute', left: 14, top: 15, color: 'var(--ink-300)' }} />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Αναζήτηση προϊόντος…"
          aria-label="Αναζήτηση προϊόντος"
          autoFocus
          style={{
            width: '100%', height: 46, padding: '0 14px 0 38px', background: '#fff',
            border: '1px solid rgba(63,75,70,0.12)', borderRadius: 12, fontSize: 16, outline: 'none',
          }}
        />
      </div>
      {q.length >= 2 && (
        <div style={{ background: '#fff', borderRadius: 14, boxShadow: 'var(--shadow-card)', overflow: 'hidden', marginTop: 8 }}>
          {hits.length === 0 ? (
            <p style={{ padding: '12px 14px', fontSize: 13, color: 'var(--ink-500)', margin: 0 }}>Δεν βρέθηκε. Για καινούργιο είδος χρησιμοποιήστε «Νέο προϊόν».</p>
          ) : hits.map((p, i) => {
            const n = pickPlantName(p);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => { onChange(p); setQuery(''); }}
                className="ios-tap"
                style={{
                  width: '100%', textAlign: 'left', padding: '11px 14px', background: 'transparent',
                  borderTop: i > 0 ? '1px solid rgba(63,75,70,0.08)' : 0,
                }}
              >
                <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--ink-900)' }}>{n.primary}</div>
                {n.secondary && <div className="font-display" style={{ fontStyle: 'italic', fontSize: 12, color: 'var(--ink-500)' }}>{n.secondary}</div>}
              </button>
            );
          })}
        </div>
      )}
    </Field>
  );
}

function Field({ label, hint, required, compact, children }: { label: string; hint?: string; required?: boolean; compact?: boolean; children: ReactNode }) {
  return (
    <div style={{ marginBottom: compact ? 0 : 16 }}>
      <span className="text-eyebrow" style={{ fontSize: 9, marginBottom: 6, display: 'block', color: 'var(--ink-500)' }}>
        {label}
        {required && <span style={{ color: 'var(--clay)', marginLeft: 4 }}>*</span>}
        {hint && <span style={{ marginLeft: 6, textTransform: 'none', letterSpacing: 0, color: 'var(--ink-300)' }}>{hint}</span>}
      </span>
      {children}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="ios-tap"
      style={{
        height: 36, padding: '0 14px', borderRadius: 999, fontSize: 14, fontWeight: 500,
        background: active ? 'var(--sage-700)' : '#fff',
        color: active ? 'var(--cream-50)' : 'var(--ink-700)',
        border: `1px solid ${active ? 'var(--sage-700)' : 'rgba(63,75,70,0.14)'}`,
      }}
    >
      {children}
    </button>
  );
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: Array<{ value: T; label: string }>; onChange: (v: T) => void }) {
  return (
    <div role="radiogroup" style={{ display: 'flex', background: 'var(--cream-200)', borderRadius: 12, padding: 3 }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className="ios-tap"
            style={{
              flex: 1, height: 38, borderRadius: 10, fontSize: 14, fontWeight: 600,
              background: on ? '#fff' : 'transparent', color: on ? 'var(--sage-800)' : 'var(--ink-500)',
              boxShadow: on ? '0 1px 2px rgba(31,51,41,0.08)' : 'none',
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

const boxStyle = {
  flex: 1, minWidth: 0, height: 46, padding: '0 14px', background: '#fff',
  border: '1px solid rgba(63,75,70,0.12)', borderRadius: 12, fontSize: 16, outline: 'none',
} as const;

function NumberBox({ label, value, onChange, placeholder }: { label: string; value: number | null; onChange: (n: number | null) => void; placeholder: string }) {
  return (
    <input
      type="number"
      inputMode="numeric"
      min="0"
      aria-label={label}
      placeholder={placeholder}
      value={value ?? ''}
      onChange={(e) => {
        const n = Number.parseInt(e.target.value, 10);
        onChange(Number.isFinite(n) && n >= 0 ? n : null);
      }}
      className="font-mono-meta"
      style={{ ...boxStyle, textAlign: 'center' }}
    />
  );
}

function TextBox({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <input
      type="text"
      aria-label={label}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={boxStyle}
    />
  );
}

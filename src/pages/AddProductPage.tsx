import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Check, FileText, Loader2, Plus, ShoppingCart, Sparkles } from 'lucide-react';
import CustomerFormField from '@/components/CustomerFormField';
import PriceInput from '@/components/PriceInput';
import VatPicker from '@/components/VatPicker';
import { lookupBotanicalName, useCreateProduct, type CreateProductResponse } from '@/lib/queries';
import {
  COMMON_POT_SIZES_L, EMPTY_PRODUCT_FORM, PLANT_TYPE_LABEL, PRODUCT_KIND_LABEL, botanicalCandidates,
  buildPlantBody, buildVariantBody, describeProductSize, validateProductForm,
  type NewProductForm, type PlantType, type ProductKind,
} from '@/lib/new-product';
import { fmtEUR } from '@/lib/format';
import type { DuplicateSeed } from '@/pages/NewOrderWizard';

/**
 * «Νέο προϊόν» — add a catalogue item from the phone in under a minute.
 *
 * One screen, Greek name first, the pot size as tap chips, everything else
 * optional. Saves through the same two Bloom endpoints the desktop dialog
 * uses, then offers to start an order or quote with the new line already in.
 */
export default function AddProductPage() {
  const navigate = useNavigate();
  const create = useCreateProduct();
  const [form, setForm] = useState<NewProductForm>(EMPTY_PRODUCT_FORM);
  const [more, setMore] = useState(false);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [created, setCreated] = useState<CreateProductResponse | null>(null);

  const set = <K extends keyof NewProductForm>(k: K, v: NewProductForm[K]) => setForm((f) => ({ ...f, [k]: v }));
  const problem = validateProductForm(form);
  const isPlant = form.kind === 'plant';

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
      const res = await create.mutateAsync({ plant: buildPlantBody(form), variant: buildVariantBody(form) });
      setCreated(res);
      toast.success('Το προϊόν προστέθηκε στον κατάλογο');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Αποτυχία δημιουργίας');
    }
  }

  function startWith(path: '/orders/new' | '/quotes/new') {
    if (!created) return;
    const seed: DuplicateSeed = {
      customer: null,
      lines: [{
        variant_id: created.variant.id,
        qty: 1,
        unit_price: form.unitPrice,
        vat_rate: form.vatRate,
        description: '',
      }],
    };
    navigate(path, { state: { duplicate: seed } });
  }

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
            {created ? 'Προστέθηκε' : 'Νέο προϊόν'}
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
              <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink-900)' }}>{form.commonName.trim()}</div>
              {form.scientificName.trim() && (
                <div className="font-display" style={{ fontStyle: 'italic', fontSize: 13, color: 'var(--ink-500)' }}>{form.scientificName.trim()}</div>
              )}
              <div className="font-mono-meta" style={{ fontSize: 12, color: 'var(--ink-500)', marginTop: 2 }}>
                {[describeProductSize(form), form.unitPrice > 0 ? fmtEUR(form.unitPrice) : null].filter(Boolean).join(' · ') || PRODUCT_KIND_LABEL[form.kind]}
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
            onClick={() => { setForm(EMPTY_PRODUCT_FORM); setSuggestions([]); setCreated(null); }}
            className="ios-tap"
            style={{ height: 44, color: 'var(--sage-800)', fontSize: 15, fontWeight: 500, background: 'transparent' }}
          >
            <Plus size={16} style={{ display: 'inline', verticalAlign: -3, marginRight: 6 }} />
            Και άλλο προϊόν
          </button>
          <button type="button" onClick={() => navigate('/')} className="ios-tap" style={{ height: 44, color: 'var(--ink-500)', fontSize: 15, background: 'transparent' }}>
            Τέλος
          </button>
        </div>
      ) : (
        <>
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px 24px' }}>
            {/* Kind */}
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
              placeholder={isPlant ? 'π.χ. Λεβάντα' : 'π.χ. Γλάστρα τερακότα 30'}
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

            {isPlant && (
              <Field label="Γλάστρα" required>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {COMMON_POT_SIZES_L.map((l) => (
                    <Chip key={l} active={form.potVolumeL === l} onClick={() => set('potVolumeL', l)}>
                      {l}L
                    </Chip>
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
            )}

            {isPlant && (
              <Field label="Ύψος (cm)" hint="προαιρετικό">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <NumberBox label="Ύψος από" value={form.heightMinCm} onChange={(n) => set('heightMinCm', n)} placeholder="από" />
                  <span style={{ color: 'var(--ink-300)' }}>–</span>
                  <NumberBox label="Ύψος έως" value={form.heightMaxCm} onChange={(n) => set('heightMaxCm', n)} placeholder="έως" />
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
                Περισσότερα (τύπος φυτού, σημείωση)
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
                <CustomerFormField label="Σημείωση" value={form.notes} onChange={(v) => set('notes', v)} placeholder="π.χ. μόνο κατόπιν παραγγελίας" />
              </>
            )}
          </div>

          <div className="pb-safe" style={{ padding: '14px 20px 16px', background: '#fff', borderTop: '1px solid rgba(63,75,70,0.10)' }}>
            {problem && form.commonName.trim().length >= 2 && (
              <p style={{ fontSize: 12, color: 'var(--ink-500)', margin: '0 0 8px', textAlign: 'center' }}>{problem}</p>
            )}
            <button type="button" disabled={!!problem || create.isPending} onClick={() => void onSave()} className="btn-primary ios-tap">
              {create.isPending ? (
                <>
                  <Loader2 size={16} color="var(--cream-50)" className="animate-spin" />
                  Αποθήκευση…
                </>
              ) : 'Αποθήκευση προϊόντος'}
            </button>
          </div>
        </>
      )}
    </div>
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
      style={{
        flex: 1, minWidth: 0, height: 46, padding: '0 14px', background: '#fff', textAlign: 'center',
        border: '1px solid rgba(63,75,70,0.12)', borderRadius: 12, fontSize: 16, outline: 'none',
      }}
    />
  );
}

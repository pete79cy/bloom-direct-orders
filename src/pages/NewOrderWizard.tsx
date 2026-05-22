import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowLeft, Search, Plus, Trash2, Tag, FileText, Edit3,
} from 'lucide-react';
import MobileStepper from '@/components/MobileStepper';
import FullScreenSheet from '@/components/FullScreenSheet';
import QtyStepper from '@/components/QtyStepper';
import VariantCard from '@/components/VariantCard';
import PlantTile from '@/components/PlantTile';
import LeafMark from '@/components/LeafMark';
import {
  useCustomers, usePlants, useVariants, useCustomerPrices, useCreateDirectOrder,
} from '@/lib/queries';
import { fmtEUR, fmtLongDate, isoToday, addDays } from '@/lib/format';
import {
  prettyScientificName, cleanSizeSummary, fallbackVariantLabel,
} from '@/lib/plant-display';
import type { Customer, Plant, Variant, CustomerPrice } from '@/types';

const STEP_LABELS = ['Πελάτης', 'Στοιχεία', 'Γραμμές', 'Έλεγχος'];

type PriceSource = 'customer' | 'default' | 'override';

interface DraftLine {
  variant_id: string;
  qty: number;
  unit_price: number;
  price_source: PriceSource;
}

export default function NewOrderWizard() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [deliveryDate, setDeliveryDate] = useState(addDays(isoToday(), 3));
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([]);

  const { data: customers = [] } = useCustomers();
  const { data: plants = [] } = usePlants();
  const { data: variants = [] } = useVariants();
  const { data: customerPrices = [] } = useCustomerPrices(customer?.id);

  // Re-price existing lines whenever customer prices land or change.
  useEffect(() => {
    if (!customer || customerPrices.length === 0) return;
    setLines((prev) =>
      prev.map((l) => {
        if (l.price_source !== 'default') return l; // user has overridden or already on customer
        const match = customerPrices.find((cp) => cp.variant_id === l.variant_id);
        if (!match) return l;
        return { ...l, unit_price: match.effective_unit_price, price_source: 'customer' };
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerPrices]);

  return (
    <div className="min-h-full pb-24">
      <header className="px-4 pt-safe pt-4 pb-2 flex items-center gap-3">
        <button
          type="button"
          aria-label="Πίσω"
          onClick={() => (step === 0 ? navigate(-1) : setStep((s) => s - 1))}
          className="p-2 -m-2"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-semibold">Νέα παραγγελία</h1>
      </header>

      <MobileStepper steps={STEP_LABELS} current={step} />

      {step === 0 && (
        <Step1Customer
          customers={customers}
          selected={customer}
          onSelect={(c) => {
            setCustomer(c);
            setStep(1);
          }}
        />
      )}

      {step === 1 && (
        <Step2Details
          deliveryDate={deliveryDate}
          notes={notes}
          onDeliveryDateChange={setDeliveryDate}
          onNotesChange={setNotes}
          canContinue={!!deliveryDate}
          onContinue={() => setStep(2)}
        />
      )}

      {step === 2 && (
        <Step3Lines
          customer={customer!}
          plants={plants}
          variants={variants}
          customerPrices={customerPrices}
          lines={lines}
          onChange={setLines}
          onContinue={() => setStep(3)}
        />
      )}

      {step === 3 && (
        <Step4Review
          customer={customer!}
          deliveryDate={deliveryDate}
          notes={notes}
          lines={lines}
          variants={variants}
          plants={plants}
        />
      )}
    </div>
  );
}

/* ---------- Step 1 — Customer ---------- */

interface Step1Props {
  customers: Customer[];
  selected: Customer | null;
  onSelect: (c: Customer) => void;
}

function Step1Customer({ customers, selected, onSelect }: Step1Props) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (c) =>
        (c.trading_name ?? '').toLowerCase().includes(q) ||
        c.legal_name.toLowerCase().includes(q),
    );
  }, [customers, query]);

  return (
    <div className="px-4 mt-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ios-ink-sec" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Αναζήτηση πελάτη"
          className="w-full h-11 pl-10 pr-4 rounded-xl bg-white border border-gray-200 text-base"
        />
      </div>

      <ul className="mt-3 bg-white rounded-xl divide-y divide-gray-100">
        {filtered.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => onSelect(c)}
              className={
                'w-full text-left px-4 py-3 ' + (selected?.id === c.id ? 'bg-blue-50' : '')
              }
            >
              <p className="font-medium">{c.trading_name || c.legal_name}</p>
              {c.trading_name && c.legal_name !== c.trading_name && (
                <p className="text-xs text-ios-ink-sec">{c.legal_name}</p>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------- Step 2 — Details ---------- */

interface Step2Props {
  deliveryDate: string;
  notes: string;
  canContinue: boolean;
  onDeliveryDateChange: (v: string) => void;
  onNotesChange: (v: string) => void;
  onContinue: () => void;
}

function Step2Details({
  deliveryDate,
  notes,
  canContinue,
  onDeliveryDateChange,
  onNotesChange,
  onContinue,
}: Step2Props) {
  return (
    <div className="px-4 mt-3 space-y-4">
      <label className="block">
        <span className="text-sm text-ios-ink-sec mb-1 block">Ημερομηνία παράδοσης</span>
        <input
          type="date"
          required
          min={isoToday()}
          value={deliveryDate}
          onChange={(e) => onDeliveryDateChange(e.target.value)}
          className="w-full h-12 px-4 rounded-xl bg-white border border-gray-200 text-base"
        />
      </label>

      <label className="block">
        <span className="text-sm text-ios-ink-sec mb-1 block">Σημειώσεις (προαιρετικό)</span>
        <textarea
          rows={3}
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          className="w-full px-4 py-3 rounded-xl bg-white border border-gray-200 text-base"
        />
      </label>

      <button
        type="button"
        disabled={!canContinue}
        onClick={onContinue}
        className="w-full h-12 rounded-xl bg-ios-tint text-white font-medium disabled:opacity-50"
      >
        Συνέχεια
      </button>
    </div>
  );
}

/* ---------- Step 3 — Lines ---------- */

interface Step3Props {
  customer: Customer;
  plants: Plant[];
  variants: Variant[];
  customerPrices: CustomerPrice[];
  lines: DraftLine[];
  onChange: (lines: DraftLine[]) => void;
  onContinue: () => void;
}

function Step3Lines({ customer, plants, variants, customerPrices, lines, onChange, onContinue }: Step3Props) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [query, setQuery] = useState('');

  const variantsWithPlant = useMemo(
    () =>
      variants.map((v) => {
        const p = plants.find((x) => x.id === v.plant_id);
        const prettyName = prettyScientificName(p?.scientific_name);
        const cleanedSize = cleanSizeSummary(v.size_summary) ?? '';
        return {
          variant: v,
          plant: p,
          label: [prettyName, cleanedSize].filter(Boolean).join(' · ') ||
                 fallbackVariantLabel(v.variant_code),
          // Keep variant_code in the search blob so SKU lookups still work,
          // but never render it.
          searchBlob: `${prettyName} ${p?.common_name ?? ''} ${v.variant_code} ${cleanedSize}`.toLowerCase(),
        };
      }),
    [variants, plants],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return variantsWithPlant.slice(0, 50);
    return variantsWithPlant.filter((x) => x.searchBlob.includes(q)).slice(0, 50);
  }, [variantsWithPlant, query]);

  const total = lines.reduce((s, l) => s + l.qty * l.unit_price, 0);

  function priceForVariant(variantId: string, fallback: number | null): { price: number; source: PriceSource } {
    const cp = customerPrices.find((x) => x.variant_id === variantId);
    if (cp) return { price: cp.effective_unit_price, source: 'customer' };
    return { price: fallback ?? 0, source: 'default' };
  }

  function addLine(v: Variant) {
    if (lines.some((l) => l.variant_id === v.id)) return;
    const { price, source } = priceForVariant(v.id, v.default_sell_price);
    const next: DraftLine = { variant_id: v.id, qty: 1, unit_price: price, price_source: source };
    onChange([...lines, next]);
    // Don't close the search modal — let the user add multiple plants in
    // a single search session. The modal is dismissed via the close button.
  }

  function updateLine(variantId: string, patch: Partial<DraftLine>) {
    onChange(lines.map((l) => (l.variant_id === variantId ? { ...l, ...patch } : l)));
  }

  function removeLine(variantId: string) {
    onChange(lines.filter((l) => l.variant_id !== variantId));
  }

  return (
    <div className="px-4 mt-3 pb-44">
      {/* Customer + delivery context chip */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 14px',
          background: 'var(--sage-50)',
          borderRadius: 12,
          border: '1px solid rgba(63,107,92,0.15)',
          marginBottom: 18,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 13, fontWeight: 500 }}>
            {customer.trading_name || customer.legal_name}
          </p>
          <p
            className="font-mono-meta"
            style={{ fontSize: 10, color: 'var(--ink-500)', marginTop: 2, letterSpacing: '0.06em', textTransform: 'uppercase' }}
          >
            ΠΑΡΑΓΓΕΛΙΑ ΑΠΕΥΘΕΙΑΣ
          </p>
        </div>
      </div>

      <div className="folio mb-2.5">
        <span className="folio-num">{String(lines.length).padStart(2, '0')}</span>
        <span>γραμμές</span>
      </div>

      {lines.length === 0 ? (
        <p className="text-center text-ink-500 py-8 text-sm">Καμία γραμμή ακόμη</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {lines.map((l) => {
            const meta = variantsWithPlant.find((v) => v.variant.id === l.variant_id);
            return (
              <LineRow
                key={l.variant_id}
                line={l}
                label={meta?.label ?? l.variant_id}
                onUpdate={(patch) => updateLine(l.variant_id, patch)}
                onRemove={() => removeLine(l.variant_id)}
              />
            );
          })}
        </div>
      )}

      <div className="fixed bottom-[145px] inset-x-5 z-20">
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="btn-secondary ios-tap"
        >
          <Plus className="w-4 h-4" strokeWidth={1.75} color="var(--sage-700)" />
          Προσθήκη φυτού
        </button>
      </div>

      <div
        className="fixed bottom-0 inset-x-0 pb-safe z-10"
        style={{ background: '#fff', borderTop: '1px solid rgba(63,75,70,0.10)', padding: '16px 20px 20px' }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
          <span className="text-eyebrow">Σύνολο</span>
          <span className="font-mono-meta" style={{ fontSize: 24, fontWeight: 500 }}>
            {fmtEUR(total)}
          </span>
        </div>
        <button
          type="button"
          disabled={lines.length === 0}
          onClick={onContinue}
          className="btn-primary ios-tap"
          style={{ height: 48 }}
        >
          Συνέχεια
        </button>
      </div>

      <FullScreenSheet open={sheetOpen} onClose={() => { setSheetOpen(false); setQuery(''); }}>
        {/* Header — close button + breadcrumb + display title */}
        <div
          className="pt-safe"
          style={{
            padding: '14px 16px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            borderBottom: '1px solid rgba(63,75,70,0.06)',
          }}
        >
          <button
            type="button"
            aria-label="Κλείσιμο"
            onClick={() => { setSheetOpen(false); setQuery(''); }}
            className="ios-tap"
            style={{
              width: 36, height: 36, borderRadius: 999,
              background: 'rgba(63,75,70,0.06)',
              color: 'var(--ink-700)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14">
              <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="text-eyebrow" style={{ fontSize: 9, marginBottom: 1 }}>
              Βήμα 3 · Γραμμές
            </div>
            <h3
              className="font-display"
              style={{ fontStyle: 'italic', fontSize: 19, color: 'var(--sage-800)', lineHeight: 1.1 }}
            >
              Προσθήκη φυτού
            </h3>
          </div>
        </div>

        {/* Sage-bordered focused search input */}
        <div style={{ padding: '12px 16px 0', position: 'relative' }}>
          <Search
            className="absolute pointer-events-none"
            style={{ left: 30, top: 27, color: 'var(--sage-700)' }}
            size={16}
          />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Αναζήτηση φυτού…"
            style={{
              width: '100%', height: 46, paddingLeft: 40, paddingRight: 40,
              background: '#fff',
              border: '1.5px solid var(--sage-400)',
              boxShadow: '0 0 0 4px rgba(63,107,92,0.10)',
              borderRadius: 12, fontSize: 16, outline: 'none',
            }}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Καθαρισμός"
              style={{
                position: 'absolute', right: 24, top: 26,
                width: 22, height: 22, borderRadius: 999,
                background: 'rgba(63,75,70,0.18)',
                color: '#fff', fontSize: 12, fontWeight: 600,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              ×
            </button>
          )}
        </div>

        {/* Folio counter row */}
        <div style={{ padding: '14px 16px 6px' }}>
          <div className="folio">
            {filtered.length > 0 && (
              <span className="folio-num">{String(filtered.length).padStart(2, '0')}</span>
            )}
            <span>{filtered.length > 0 ? 'αποτελέσματα' : 'πληκτρολόγησε για αναζήτηση'}</span>
            {query && (
              <span style={{ marginLeft: 'auto', color: 'var(--ink-300)', textTransform: 'none', letterSpacing: 0 }}>
                για «{query}»
              </span>
            )}
          </div>
        </div>

        {/* Scrollable results — flex:1 so it absorbs all the space above the keyboard */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '6px 16px 24px', minHeight: 0 }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '64px 16px', textAlign: 'center' }}>
              <div style={{ display: 'inline-flex', color: 'var(--sage-300)', marginBottom: 12 }}>
                <LeafMark size={48} />
              </div>
              <p className="font-display" style={{ fontStyle: 'italic', color: 'var(--ink-500)', fontSize: 20 }}>
                Κανένα φυτό
              </p>
              <p style={{ fontSize: 13, color: 'var(--ink-300)', marginTop: 4 }}>
                Δοκίμασε άλλη αναζήτηση
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {filtered.map((x) => (
                <VariantCard
                  key={x.variant.id}
                  variant={x.variant}
                  plant={x.plant}
                  customerPrice={
                    customerPrices.find((cp) => cp.variant_id === x.variant.id)?.effective_unit_price
                  }
                  added={lines.some((l) => l.variant_id === x.variant.id)}
                  onAdd={() => addLine(x.variant)}
                />
              ))}
            </div>
          )}
        </div>
      </FullScreenSheet>
    </div>
  );
}

interface LineRowProps {
  line: DraftLine;
  label: string;
  onUpdate: (patch: Partial<DraftLine>) => void;
  onRemove: () => void;
}

function LineRow({ line, label, onUpdate, onRemove }: LineRowProps) {
  const [priceEdit, setPriceEdit] = useState(false);
  const [primary, ...rest] = label.split(' · ');
  const meta = rest.join(' · ');
  const tileLabel = primary.split(/\s+/)[0]?.slice(0, 4).toUpperCase() ?? 'PLNT';

  const PriceIcon =
    line.price_source === 'customer' ? Tag : line.price_source === 'override' ? Edit3 : FileText;
  const priceColor =
    line.price_source === 'customer' ? 'var(--sage-700)' :
    line.price_source === 'override' ? 'var(--honey)' : 'var(--ink-500)';
  const priceLabel =
    line.price_source === 'customer' ? 'τιμή πελάτη' :
    line.price_source === 'override' ? 'override' : 'βασική τιμή';

  return (
    <div
      style={{
        background: '#fff',
        borderRadius: 16,
        padding: 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        boxShadow: 'var(--shadow-card)',
      }}
    >
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <PlantTile label={tileLabel} size={56} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p
            className="font-display"
            style={{ fontStyle: 'italic', fontSize: 16, fontWeight: 500, color: 'var(--ink-900)' }}
          >
            {primary}
          </p>
          {meta && (
            <p
              className="font-mono-meta"
              style={{
                fontSize: 10,
                color: 'var(--ink-500)',
                marginTop: 3,
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
              }}
            >
              {meta}
            </p>
          )}
          <button
            type="button"
            onClick={() => setPriceEdit(true)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              marginTop: 8,
              color: priceColor,
            }}
          >
            <PriceIcon size={11} />
            <span className="font-mono-meta" style={{ fontSize: 11, fontWeight: 500 }}>
              {fmtEUR(line.unit_price)}
            </span>
            <span style={{ fontSize: 10, opacity: 0.7 }}>· {priceLabel}</span>
          </button>
        </div>
        <button
          type="button"
          aria-label="Διαγραφή"
          onClick={onRemove}
          style={{ color: 'var(--ink-300)', padding: 4, marginTop: -2, flexShrink: 0 }}
        >
          <Trash2 size={14} />
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <QtyStepper value={line.qty} min={1} onChange={(qty) => onUpdate({ qty })} />
        <span className="font-mono-meta" style={{ fontSize: 15, fontWeight: 500 }}>
          {fmtEUR(line.qty * line.unit_price)}
        </span>
      </div>

      {priceEdit && (
        <div className="mt-2 flex items-center gap-2">
          <input
            type="number"
            step="0.01"
            min="0"
            defaultValue={line.unit_price}
            onBlur={(e) => {
              const v = parseFloat(e.target.value);
              if (!Number.isNaN(v) && v >= 0) {
                onUpdate({ unit_price: v, price_source: 'override' });
              }
              setPriceEdit(false);
            }}
            className="w-32 h-10 px-3 rounded-lg border border-gray-300"
            autoFocus
          />
        </div>
      )}
    </div>
  );
}

/* ---------- Step 4 — Review + Save ---------- */

interface Step4Props {
  customer: Customer;
  deliveryDate: string;
  notes: string;
  lines: DraftLine[];
  variants: Variant[];
  plants: Plant[];
}

function Step4Review({ customer, deliveryDate, notes, lines, variants, plants }: Step4Props) {
  const navigate = useNavigate();
  const save = useCreateDirectOrder();

  const total = lines.reduce((s, l) => s + l.qty * l.unit_price, 0);

  function variantLabel(variantId: string): string {
    const v = variants.find((x) => x.id === variantId);
    if (!v) return variantId;
    const p = plants.find((x) => x.id === v.plant_id);
    return [p?.scientific_name, v.size_summary].filter(Boolean).join(' · ');
  }

  async function onSave() {
    try {
      const res = await save.mutateAsync({
        order: {
          customer_id: customer.id,
          status: 'PENDING',
          delivery_date: deliveryDate,
          notes: notes || null,
        },
        lines: lines.map((l, i) => ({
          variant_id: l.variant_id,
          qty: l.qty,
          unit_price: l.unit_price,
          line_no: i + 1,
        })),
      });
      toast.success('Παραγγελία αποθηκεύτηκε');
      navigate(`/orders/${res.orderId}`, { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Σφάλμα αποθήκευσης');
    }
  }

  return (
    <div className="px-4 mt-3 pb-32">
      <div className="text-center my-6">
        <p className="text-sm text-ios-ink-sec">Σύνολο</p>
        <p className="text-4xl font-semibold tabular-nums">{fmtEUR(total)}</p>
      </div>

      <div className="bg-white rounded-xl p-4 space-y-2">
        <Row label="Πελάτης" value={customer.trading_name || customer.legal_name} />
        <Row label="Παράδοση" value={fmtLongDate(deliveryDate)} />
        <Row label="Γραμμές" value={String(lines.length)} />
      </div>

      <ul className="mt-3 bg-white rounded-xl divide-y divide-gray-100">
        {lines.map((l) => (
          <li key={l.variant_id} className="px-4 py-3 flex items-center justify-between">
            <div className="min-w-0">
              <p className="font-medium truncate">{variantLabel(l.variant_id)}</p>
              <p className="text-xs text-ios-ink-sec">
                {l.qty} × {fmtEUR(l.unit_price)}
              </p>
            </div>
            <span className="tabular-nums font-medium">{fmtEUR(l.qty * l.unit_price)}</span>
          </li>
        ))}
      </ul>

      <div className="fixed bottom-0 inset-x-0 bg-white border-t border-gray-200 pb-safe p-4">
        <button
          type="button"
          disabled={save.isPending}
          onClick={onSave}
          className="w-full h-12 rounded-xl bg-ios-green text-white font-medium disabled:opacity-50"
        >
          {save.isPending ? 'Αποθήκευση…' : 'Αποθήκευση παραγγελίας'}
        </button>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-sm text-ios-ink-sec">{label}</span>
      <span>{value}</span>
    </div>
  );
}

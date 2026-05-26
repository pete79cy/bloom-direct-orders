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
import NewCustomerSheet from '@/components/NewCustomerSheet';
import AddLineSheet, { type AddLineResult } from '@/components/AddLineSheet';
import {
  useCustomers, usePlants, useVariants, useCustomerPrices, useCreateDirectOrder,
  useSuppliers, useSupplierProducts, useSupplierPrices,
} from '@/lib/queries';
import { buildCostMap, marginPct } from '@/lib/supplier-cost';
import PriceInput from '@/components/PriceInput';
import { fmtEUR, fmtLongDate, isoToday, addDays } from '@/lib/format';
import {
  pickPlantName, sizeDetailsString, fallbackVariantLabel,
} from '@/lib/plant-display';
import VatPicker from '@/components/VatPicker';
import {
  VAT_LABEL,
  vatBreakdown,
  type VatRate,
} from '@/lib/vat';
import type { Customer, Plant, Variant, CustomerPrice } from '@/types';

const STEP_LABELS = ['Πελάτης', 'Στοιχεία', 'Γραμμές', 'Έλεγχος'];

type PriceSource = 'customer' | 'default' | 'override';

interface DraftLine {
  variant_id: string;
  qty: number;
  unit_price: number;
  price_source: PriceSource;
  vat_rate: VatRate;
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
  const { data: suppliers = [] } = useSuppliers();
  const { data: supplierProducts = [] } = useSupplierProducts();
  const { data: supplierPrices = [] } = useSupplierPrices();

  // Map variant_id → supplier display name. When a variant has multiple
  // suppliers, the highest match_confidence wins; ties broken by name.
  // We compute once and pass down to step 3 + step 4.
  const supplierByVariant = useMemo(() => {
    const byId = new Map<string, string>();
    const supplierName = new Map(suppliers.map((s) => [s.id, s.trading_name || s.name]));
    const sorted = [...supplierProducts].sort((a, b) => b.match_confidence - a.match_confidence);
    for (const sp of sorted) {
      if (byId.has(sp.variant_id)) continue;
      const name = supplierName.get(sp.supplier_id) || sp.supplier_name_text;
      if (name) byId.set(sp.variant_id, name);
    }
    return byId;
  }, [supplierProducts, suppliers]);

  // Map variant_id → cheapest current cost. Used to show cost alongside
  // sell price so the user can judge margin while pricing.
  const costByVariant = useMemo(
    () => buildCostMap(supplierProducts, supplierPrices),
    [supplierProducts, supplierPrices],
  );

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
          supplierByVariant={supplierByVariant}
          costByVariant={costByVariant}
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
          supplierByVariant={supplierByVariant}
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
  const [newCustomerOpen, setNewCustomerOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (c) =>
        (c.trading_name ?? '').toLowerCase().includes(q) ||
        c.legal_name.toLowerCase().includes(q),
    );
  }, [customers, query]);

  const trimmedQuery = query.trim();
  const noResults = trimmedQuery.length > 0 && filtered.length === 0;

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

      {/* Quick action — "Create customer «<query>»" appears only when the
          search has produced no matches; pre-fills trading_name from the
          query. This is the fast path: type the name, no match → tap. */}
      {noResults && (
        <button
          type="button"
          onClick={() => setNewCustomerOpen(true)}
          className="ios-tap"
          style={{
            width: '100%',
            marginTop: 12,
            padding: '14px 16px',
            background: 'var(--sage-50)',
            border: '1px solid rgba(63,107,92,0.20)',
            borderRadius: 14,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            color: 'var(--sage-700)',
            textAlign: 'left',
          }}
        >
          <span
            style={{
              width: 32,
              height: 32,
              borderRadius: 999,
              background: 'var(--sage-700)',
              color: 'var(--cream-50)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Plus size={16} strokeWidth={2.25} />
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--sage-800)' }}>
              Δημιουργία πελάτη
            </p>
            <p
              style={{
                fontSize: 12,
                color: 'var(--ink-500)',
                marginTop: 2,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              «{trimmedQuery}»
            </p>
          </span>
        </button>
      )}

      {/* Always-visible "Νέος πελάτης" entry when the search is empty —
          keeps the new-customer flow one tap away even before typing. */}
      {!trimmedQuery && customers.length > 0 && (
        <button
          type="button"
          onClick={() => setNewCustomerOpen(true)}
          className="ios-tap"
          style={{
            width: '100%',
            marginTop: 12,
            padding: '12px 14px',
            background: '#fff',
            border: '1px dashed rgba(63,107,92,0.30)',
            borderRadius: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            color: 'var(--sage-700)',
            textAlign: 'left',
            fontSize: 14,
            fontWeight: 500,
          }}
        >
          <Plus size={14} strokeWidth={2} color="var(--sage-700)" />
          Νέος πελάτης
        </button>
      )}

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

      <NewCustomerSheet
        open={newCustomerOpen}
        onClose={() => setNewCustomerOpen(false)}
        initialTradingName={trimmedQuery}
        onCreated={(customer) => {
          setNewCustomerOpen(false);
          setQuery('');
          onSelect(customer);   // auto-select + advances to step 2
        }}
      />
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
  supplierByVariant: Map<string, string>;
  costByVariant: Map<string, number>;
  lines: DraftLine[];
  onChange: (lines: DraftLine[]) => void;
  onContinue: () => void;
}

function Step3Lines({
  customer, plants, variants, customerPrices, supplierByVariant, costByVariant,
  lines, onChange, onContinue,
}: Step3Props) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [query, setQuery] = useState('');
  // The variant currently being configured in the AddLineSheet. null = closed.
  const [configuringVariant, setConfiguringVariant] = useState<Variant | null>(null);

  const variantsWithPlant = useMemo(
    () =>
      variants.map((v) => {
        const p = plants.find((x) => x.id === v.plant_id);
        const { primary, secondary } = pickPlantName(p ?? null);
        const cleanedSize = sizeDetailsString({
          pot_volume_l: v.pot_volume_l,
          height_min_cm: v.height_min_cm,
          height_max_cm: v.height_max_cm,
          girth_min_cm: v.girth_min_cm,
          girth_max_cm: v.girth_max_cm,
        }) ?? '';
        const supplier = supplierByVariant.get(v.id) ?? null;
        return {
          variant: v,
          plant: p,
          supplier,
          // Stored label used by LineRow (added lines) — common first,
          // then scientific, then size meta. Falls back if no plant data.
          label: [primary === 'Φυτό' ? fallbackVariantLabel(v.variant_code) : primary, secondary, cleanedSize]
            .filter(Boolean)
            .join(' · '),
          // Search includes Greek + Latin + SKU + size + supplier so any
          // search term hits.
          searchBlob: `${primary} ${secondary ?? ''} ${p?.common_name ?? ''} ${v.variant_code} ${cleanedSize} ${supplier ?? ''}`.toLowerCase(),
        };
      }),
    [variants, plants, supplierByVariant],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return variantsWithPlant.slice(0, 50);
    return variantsWithPlant.filter((x) => x.searchBlob.includes(q)).slice(0, 50);
  }, [variantsWithPlant, query]);

  // Net subtotal, VAT breakdown, and grand total — single source of truth
  // used by the footer (here) and the review step.
  const subtotal = lines.reduce((s, l) => s + l.qty * l.unit_price, 0);
  const totalsBreakdown = vatBreakdown(
    lines.map((l) => ({ net: l.qty * l.unit_price, vat_rate: l.vat_rate })),
  );
  const vatTotal = totalsBreakdown.reduce((s, r) => s + r.amount, 0);
  const grandTotal = subtotal + vatTotal;

  function priceForVariant(variantId: string, fallback: number | null): { price: number; source: PriceSource } {
    const cp = customerPrices.find((x) => x.variant_id === variantId);
    if (cp) return { price: cp.effective_unit_price, source: 'customer' };
    return { price: fallback ?? 0, source: 'default' };
  }

  /**
   * The + button on a VariantCard. Two paths:
   *  - Variant already in cart → toast, do nothing else
   *  - New variant → open the AddLineSheet to configure price/qty/VAT
   * The actual line is appended only after commit from the sheet.
   */
  function requestAddLine(v: Variant) {
    if (lines.some((l) => l.variant_id === v.id)) {
      toast.message('Ήδη στην παραγγελία');
      return;
    }
    setConfiguringVariant(v);
  }

  /** Commit handler — fired by AddLineSheet when user taps "Προσθήκη". */
  function commitConfiguredLine(result: AddLineResult) {
    const v = configuringVariant;
    if (!v) return;
    const { source } = priceForVariant(v.id, v.default_sell_price);
    // If the user typed a different price than the seeded one, the line is
    // 'override'; if they kept the customer-specific price, source stays
    // 'customer'; otherwise it's the default catalogue price.
    const finalSource: PriceSource = result.priceOverridden ? 'override' : source;
    const next: DraftLine = {
      variant_id: v.id,
      qty: result.qty,
      unit_price: result.unit_price,
      price_source: finalSource,
      vat_rate: result.vat_rate,
    };
    onChange([...lines, next]);
    setConfiguringVariant(null);
    // Leave the search sheet open with its query — user can keep adding.
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
                plant={meta?.plant}
                supplier={meta?.supplier ?? null}
                variant={meta?.variant}
                cost={costByVariant.get(l.variant_id) ?? null}
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
        style={{ background: '#fff', borderTop: '1px solid rgba(63,75,70,0.10)', padding: '14px 20px 16px' }}
      >
        {totalsBreakdown.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            {/* Subtotal */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
              <span style={{ fontSize: 12, color: 'var(--ink-500)' }}>Υποσύνολο</span>
              <span className="font-mono-meta" style={{ fontSize: 13, color: 'var(--ink-700)' }}>
                {fmtEUR(subtotal)}
              </span>
            </div>
            {/* VAT rows — one per rate present */}
            {totalsBreakdown.map((row) => (
              <div
                key={row.rate}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}
              >
                <span style={{ fontSize: 12, color: 'var(--ink-500)' }}>{VAT_LABEL[row.rate]}</span>
                <span className="font-mono-meta" style={{ fontSize: 13, color: 'var(--ink-700)' }}>
                  {fmtEUR(row.amount)}
                </span>
              </div>
            ))}
            {/* Hairline */}
            <div className="hairline" style={{ margin: '8px 0' }} />
            {/* Grand total */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span className="text-eyebrow">Σύνολο</span>
              <span className="font-mono-meta" style={{ fontSize: 22, fontWeight: 500, color: 'var(--sage-800)' }}>
                {fmtEUR(grandTotal)}
              </span>
            </div>
          </div>
        )}
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
                  supplier={x.supplier}
                  customerPrice={
                    customerPrices.find((cp) => cp.variant_id === x.variant.id)?.effective_unit_price
                  }
                  cost={costByVariant.get(x.variant.id) ?? null}
                  added={lines.some((l) => l.variant_id === x.variant.id)}
                  onAdd={() => requestAddLine(x.variant)}
                />
              ))}
            </div>
          )}
        </div>
      </FullScreenSheet>

      {/* Configure-line sheet — opens above the search modal when the user
          taps + on a not-yet-added variant. Commits via onAdd → appends to
          lines, closes itself, leaves the search modal as it was. */}
      <AddLineSheet
        open={configuringVariant !== null}
        variant={configuringVariant}
        plant={configuringVariant ? plants.find((p) => p.id === configuringVariant.plant_id) : undefined}
        supplier={configuringVariant ? supplierByVariant.get(configuringVariant.id) : null}
        cost={configuringVariant ? (costByVariant.get(configuringVariant.id) ?? null) : null}
        customerPrice={
          configuringVariant
            ? customerPrices.find((cp) => cp.variant_id === configuringVariant.id)?.effective_unit_price
            : null
        }
        onClose={() => setConfiguringVariant(null)}
        onAdd={commitConfiguredLine}
      />
    </div>
  );
}

interface LineRowProps {
  line: DraftLine;
  plant: Plant | undefined;
  variant: Variant | undefined;
  supplier: string | null;
  cost: number | null;
  onUpdate: (patch: Partial<DraftLine>) => void;
  onRemove: () => void;
}

function LineRow({ line, plant, variant, supplier, cost, onUpdate, onRemove }: LineRowProps) {
  const { primary, secondary } = pickPlantName(plant ?? null);
  const displayPrimary = primary === 'Φυτό'
    ? fallbackVariantLabel(variant?.variant_code)
    : primary;
  const size = variant ? sizeDetailsString({
    pot_volume_l: variant.pot_volume_l,
    height_min_cm: variant.height_min_cm,
    height_max_cm: variant.height_max_cm,
    girth_min_cm: variant.girth_min_cm,
    girth_max_cm: variant.girth_max_cm,
  }) : null;
  const tileLabel = (plant?.scientific_name?.split(/\s+/)[0] ?? variant?.variant_code.split('__')[0] ?? 'PLNT')
    .slice(0, 4)
    .toUpperCase();

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
          {/* Primary — Greek common name (or promoted scientific) */}
          <p
            style={{
              fontSize: 16,
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
          {/* Secondary — scientific Latin in italic serif */}
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
          {/* Supplier — eyebrow */}
          {supplier && (
            <p
              className="text-eyebrow"
              style={{
                fontSize: 9,
                marginTop: 5,
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
          {/* Size — mono uppercase */}
          {size && (
            <p
              className="font-mono-meta"
              style={{
                fontSize: 10,
                color: 'var(--ink-500)',
                marginTop: supplier ? 2 : 5,
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
              }}
            >
              {size}
            </p>
          )}
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

      {/* Price area — Cost (read-only) + Sell (editable input) side by side.
          The sell input is always editable: no separate edit mode, no
          tap-to-reveal. Margin % computed from the cost on the left. */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1.2fr',
          gap: 12,
          marginTop: 4,
          paddingTop: 12,
          borderTop: '1px dashed rgba(63,75,70,0.10)',
        }}
      >
        {/* Cost column */}
        <div>
          <div className="text-eyebrow" style={{ fontSize: 9, marginBottom: 4 }}>
            Κόστος
          </div>
          {cost != null ? (
            <>
              <div
                className="font-mono-meta"
                style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink-700)' }}
              >
                {fmtEUR(cost)}
              </div>
              {(() => {
                const m = marginPct(line.unit_price, cost);
                if (m == null) return null;
                const isLoss = m < 0;
                const isThin = !isLoss && m < 15;
                const color = isLoss ? 'var(--accent-clay)' : isThin ? 'var(--honey)' : 'var(--sage-600)';
                return (
                  <div
                    className="font-mono-meta"
                    style={{ fontSize: 10, color, marginTop: 3, fontWeight: 500 }}
                  >
                    {m >= 0 ? '+' : ''}{m.toFixed(0)}% margin
                  </div>
                );
              })()}
            </>
          ) : (
            <div
              style={{
                fontSize: 13,
                color: 'var(--ink-300)',
                fontFamily: 'var(--font-mono)',
              }}
            >
              —
            </div>
          )}
        </div>

        {/* Sell column — actual input */}
        <div>
          <div className="text-eyebrow" style={{ fontSize: 9, marginBottom: 4 }}>
            Τιμή πώλησης
          </div>
          <PriceInput
            value={line.unit_price}
            onChange={(v) =>
              onUpdate({
                unit_price: v,
                price_source: line.price_source === 'customer' && v === line.unit_price
                  ? 'customer'
                  : 'override',
              })
            }
            hint={priceLabel}
            hintColor={priceColor}
            hintIcon={<PriceIcon size={10} color={priceColor} />}
            warn={cost != null && line.unit_price < cost}
          />
        </div>
      </div>

      {/* Bottom action row — qty stepper, VAT picker, line total */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 4 }}>
        <QtyStepper value={line.qty} min={1} onChange={(qty) => onUpdate({ qty })} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <VatPicker
            value={line.vat_rate}
            onChange={(rate) => onUpdate({ vat_rate: rate })}
          />
          <span className="font-mono-meta" style={{ fontSize: 15, fontWeight: 500 }}>
            {fmtEUR(line.qty * line.unit_price)}
          </span>
        </div>
      </div>
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
  supplierByVariant: Map<string, string>;
}

function Step4Review({
  customer, deliveryDate, notes, lines, variants, plants, supplierByVariant,
}: Step4Props) {
  const navigate = useNavigate();
  const save = useCreateDirectOrder();

  const subtotal = lines.reduce((s, l) => s + l.qty * l.unit_price, 0);
  const breakdown = vatBreakdown(
    lines.map((l) => ({ net: l.qty * l.unit_price, vat_rate: l.vat_rate })),
  );
  const vatTotal = breakdown.reduce((s, r) => s + r.amount, 0);
  const grandTotal = subtotal + vatTotal;

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
          vat_rate: l.vat_rate,
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
      {/* Hero grand total */}
      <div className="text-center my-6">
        <p className="text-eyebrow" style={{ marginBottom: 6 }}>Σύνολο με ΦΠΑ</p>
        <p className="font-display" style={{ fontSize: 48, lineHeight: 1, color: 'var(--sage-800)', fontWeight: 500 }}>
          {fmtEUR(grandTotal)}
        </p>
      </div>

      {/* Summary card */}
      <div className="bg-white rounded-xl p-4 space-y-2 shadow-card" style={{ boxShadow: 'var(--shadow-card)' }}>
        <Row label="Πελάτης" value={customer.trading_name || customer.legal_name} />
        <Row label="Παράδοση" value={fmtLongDate(deliveryDate)} />
        <Row label="Γραμμές" value={String(lines.length)} />
      </div>

      {/* Totals breakdown card */}
      <div
        className="mt-3 bg-white rounded-xl p-4"
        style={{ boxShadow: 'var(--shadow-card)' }}
      >
        <div className="folio" style={{ marginBottom: 10 }}><span>Τιμολόγηση</span></div>

        <BreakdownRow label="Υποσύνολο" value={fmtEUR(subtotal)} />
        {breakdown.map((row) => (
          <BreakdownRow
            key={row.rate}
            label={VAT_LABEL[row.rate]}
            value={fmtEUR(row.amount)}
            sub={`επί ${fmtEUR(row.net)}`}
          />
        ))}
        <div className="hairline" style={{ margin: '10px 0 8px' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--sage-800)' }}>Σύνολο</span>
          <span className="font-mono-meta" style={{ fontSize: 18, fontWeight: 500, color: 'var(--sage-800)' }}>
            {fmtEUR(grandTotal)}
          </span>
        </div>
      </div>

      {/* Lines preview */}
      <div
        className="mt-3 bg-white rounded-xl overflow-hidden"
        style={{ boxShadow: 'var(--shadow-card)' }}
      >
        {lines.map((l, i) => {
          const v = variants.find((x) => x.id === l.variant_id);
          const p = plants.find((x) => x.id === v?.plant_id);
          const { primary, secondary } = pickPlantName(p ?? null);
          const supplier = supplierByVariant.get(l.variant_id);
          const size = v ? sizeDetailsString({
            pot_volume_l: v.pot_volume_l,
            height_min_cm: v.height_min_cm,
            height_max_cm: v.height_max_cm,
            girth_min_cm: v.girth_min_cm,
            girth_max_cm: v.girth_max_cm,
          }) : null;
          return (
            <div key={l.variant_id}>
              {i > 0 && <div className="hairline" style={{ margin: '0 16px' }} />}
              <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink-900)' }}>
                    {primary === 'Φυτό' ? variantLabel(l.variant_id) : primary}
                  </p>
                  {secondary && (
                    <p
                      className="font-display"
                      style={{ fontStyle: 'italic', fontSize: 12, color: 'var(--ink-500)', marginTop: 1 }}
                    >
                      {secondary}
                    </p>
                  )}
                  {(supplier || size) && (
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
                      {[supplier, size].filter(Boolean).join(' · ')}
                    </p>
                  )}
                  <p
                    className="font-mono-meta"
                    style={{
                      fontSize: 10,
                      color: 'var(--ink-300)',
                      marginTop: 3,
                      letterSpacing: '0.04em',
                    }}
                  >
                    {l.qty} × {fmtEUR(l.unit_price)} · {VAT_LABEL[l.vat_rate]}
                  </p>
                </div>
                <span className="font-mono-meta" style={{ fontSize: 13, fontWeight: 500, marginTop: 1 }}>
                  {fmtEUR(l.qty * l.unit_price)}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {notes && (
        <div
          className="mt-3 rounded-xl p-3"
          style={{ background: 'var(--cream-200)' }}
        >
          <div className="text-eyebrow" style={{ marginBottom: 4 }}>Σημειώσεις</div>
          <p style={{ fontSize: 13, color: 'var(--ink-700)', lineHeight: 1.5 }}>{notes}</p>
        </div>
      )}

      <div
        className="fixed bottom-0 inset-x-0 pb-safe"
        style={{ background: '#fff', borderTop: '1px solid rgba(63,75,70,0.10)', padding: '14px 20px 16px' }}
      >
        <button
          type="button"
          disabled={save.isPending}
          onClick={onSave}
          className="btn-primary ios-tap"
        >
          {save.isPending ? 'Αποθήκευση…' : 'Αποθήκευση παραγγελίας'}
        </button>
      </div>
    </div>
  );
}

function BreakdownRow({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
      <span style={{ fontSize: 13, color: 'var(--ink-500)' }}>
        {label}
        {sub && (
          <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--ink-300)' }}>{sub}</span>
        )}
      </span>
      <span className="font-mono-meta" style={{ fontSize: 13, color: 'var(--ink-700)' }}>
        {value}
      </span>
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

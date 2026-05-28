import { useEffect, useState } from 'react';
import { Plus, X, AlertTriangle } from 'lucide-react';
import FullScreenSheet from './FullScreenSheet';
import PriceInput from './PriceInput';
import QtyStepper from './QtyStepper';
import VatPicker from './VatPicker';
import { fmtEUR } from '@/lib/format';
import { DEFAULT_VAT_RATE, VAT_LABEL, type VatRate } from '@/lib/vat';

export interface FreeTextLineResult {
  name: string;
  size: string;
  qty: number;
  unit_price: number;
  vat_rate: VatRate;
  description: string;
}

interface Props {
  open: boolean;
  /** Pre-fill for the Όνομα field — usually the search query that
   *  produced "no matches" so the rep doesn't retype. */
  initialName: string;
  onClose: () => void;
  onAdd: (result: FreeTextLineResult) => void;
}

/**
 * Full-screen sheet for adding a free-text (non-catalogued) line.
 *
 * Mirrors AddLineSheet's layout language but adds two text fields
 * (Όνομα, Μέγεθος) above the price/qty/VAT controls. Drops the
 * cost / margin / supplier surfaces — no catalogue record exists yet,
 * so we have nothing to compare the rep's price against.
 *
 * On commit, emits a FreeTextLineResult that the wizard turns into a
 * draft DraftLine. The server creates the actual plants+variants rows
 * (status='draft') inside the order submit transaction.
 */
export default function FreeTextLineSheet({
  open,
  initialName,
  onClose,
  onAdd,
}: Props) {
  const [name, setName] = useState(initialName);
  const [size, setSize] = useState('');
  const [qty, setQty] = useState(1);
  const [unitPrice, setUnitPrice] = useState(0);
  const [vatRate, setVatRate] = useState<VatRate>(DEFAULT_VAT_RATE);
  const [description, setDescription] = useState('');

  // Reset state every time the sheet opens, pre-filling name with the
  // search query that brought the rep here.
  useEffect(() => {
    if (!open) return;
    setName(initialName);
    setSize('');
    setQty(1);
    setUnitPrice(0);
    setVatRate(DEFAULT_VAT_RATE);
    setDescription('');
  }, [open, initialName]);

  const trimmedName = name.trim();
  const trimmedSize = size.trim();
  const canCommit = trimmedName.length >= 2 && qty > 0 && unitPrice >= 0;

  const net = qty * unitPrice;
  const vatAmount = net * (vatRate / 100);
  const gross = net + vatAmount;

  function commit() {
    if (!canCommit) return;
    onAdd({
      name: trimmedName,
      size: trimmedSize,
      qty,
      unit_price: unitPrice,
      vat_rate: vatRate,
      description: description.trim(),
    });
  }

  return (
    <FullScreenSheet open={open} onClose={onClose}>
      {/* Header */}
      <div
        className="pt-safe"
        style={{
          padding: '14px 16px',
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
            width: 36,
            height: 36,
            borderRadius: 999,
            background: 'rgba(63,75,70,0.06)',
            color: 'var(--ink-700)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <X size={16} strokeWidth={1.8} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="text-eyebrow" style={{ fontSize: 9, marginBottom: 1 }}>
            Εκτός καταλόγου
          </div>
          <h3
            className="font-display"
            style={{
              fontStyle: 'italic',
              fontSize: 19,
              color: 'var(--sage-800)',
              lineHeight: 1.1,
            }}
          >
            Νέο φυτό
          </h3>
        </div>
      </div>

      {/* Warning eyebrow */}
      <div
        style={{
          padding: '10px 20px',
          background: 'rgba(214,161,78,0.08)',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 12,
          color: 'var(--honey)',
        }}
      >
        <AlertTriangle size={13} strokeWidth={1.8} />
        Θα μπει ως πρόχειρο — ο διαχειριστής θα το ελέγξει αργότερα.
      </div>

      {/* Form */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '18px 20px 24px' }}>
        {/* Name */}
        <div style={{ marginBottom: 16 }}>
          <label
            htmlFor="ftls-name"
            className="text-eyebrow"
            style={{ fontSize: 9, display: 'block', marginBottom: 6 }}
          >
            Όνομα φυτού
          </label>
          <input
            id="ftls-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="π.χ. Ficus benjamina"
            style={{
              width: '100%',
              padding: '10px 12px',
              background: 'rgba(255,255,255,0.85)',
              border: '1px solid rgba(63,75,70,0.10)',
              borderRadius: 12,
              fontSize: 15,
              color: 'var(--ink-900)',
              outline: 'none',
            }}
          />
        </div>

        {/* Size */}
        <div style={{ marginBottom: 16 }}>
          <label
            htmlFor="ftls-size"
            className="text-eyebrow"
            style={{ fontSize: 9, display: 'block', marginBottom: 6 }}
          >
            Μέγεθος / γλάστρα
          </label>
          <input
            id="ftls-size"
            value={size}
            onChange={(e) => setSize(e.target.value)}
            placeholder="π.χ. P 5L · H 80-100"
            style={{
              width: '100%',
              padding: '10px 12px',
              background: 'rgba(255,255,255,0.85)',
              border: '1px solid rgba(63,75,70,0.10)',
              borderRadius: 12,
              fontSize: 14,
              color: 'var(--ink-900)',
              outline: 'none',
            }}
          />
        </div>

        {/* Sell price */}
        <div style={{ marginBottom: 16 }}>
          <div className="text-eyebrow" style={{ fontSize: 9, marginBottom: 6 }}>
            Τιμή πώλησης
          </div>
          <PriceInput value={unitPrice} onChange={setUnitPrice} />
        </div>

        {/* Qty */}
        <div style={{ marginBottom: 16 }}>
          <div className="text-eyebrow" style={{ fontSize: 9, marginBottom: 6 }}>
            Ποσότητα
          </div>
          <QtyStepper value={qty} min={1} onChange={setQty} />
        </div>

        {/* Per-line note */}
        <div style={{ marginBottom: 16 }}>
          <label
            htmlFor="ftls-desc"
            className="text-eyebrow"
            style={{
              fontSize: 9,
              display: 'flex',
              justifyContent: 'space-between',
              marginBottom: 6,
            }}
          >
            <span>Σημείωση</span>
            <span
              style={{
                color: 'var(--ink-300)',
                letterSpacing: 0,
                textTransform: 'none',
                fontSize: 10,
              }}
            >
              προαιρετικό
            </span>
          </label>
          <textarea
            id="ftls-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="π.χ. χωρίς γλάστρα, ύψος 80cm+"
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
        <div style={{ marginBottom: 20 }}>
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
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span className="font-mono-meta" style={{ fontSize: 12, color: 'var(--ink-500)' }}>
              {qty} × {fmtEUR(unitPrice)}
            </span>
            <span className="font-mono-meta" style={{ fontSize: 13, color: 'var(--ink-700)' }}>
              {fmtEUR(net)}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--ink-500)' }}>{VAT_LABEL[vatRate]}</span>
            <span className="font-mono-meta" style={{ fontSize: 13, color: 'var(--ink-700)' }}>
              {fmtEUR(vatAmount)}
            </span>
          </div>
          <div className="hairline" style={{ margin: '4px 0 8px' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--sage-800)' }}>Σύνολο</span>
            <span
              className="font-mono-meta"
              style={{ fontSize: 18, fontWeight: 500, color: 'var(--sage-800)' }}
            >
              {fmtEUR(gross)}
            </span>
          </div>
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
          disabled={!canCommit}
          onClick={commit}
          className="btn-primary ios-tap"
        >
          <Plus size={18} color="var(--cream-50)" strokeWidth={2} />
          Προσθήκη στην παραγγελία
        </button>
      </div>
    </FullScreenSheet>
  );
}

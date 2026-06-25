import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import FullScreenSheet from './FullScreenSheet';
import { useCreateCustomer } from '@/lib/queries';
import type { Customer } from '@/types';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Optional pre-fill for the trading name field (from search query). */
  initialTradingName?: string;
  /** Fires after the customer is created and cached. */
  onCreated: (customer: Customer) => void;
}

/**
 * Full-screen create-customer form.
 *
 * Minimum field: trading_name. The rest are optional but visible so the
 * user can fill them while they have the info in hand. Save is wired to
 * POST /api/customers, which returns the created row — that row is
 * passed back via onCreated so the wizard can select it immediately.
 */
export default function NewCustomerSheet({
  open,
  onClose,
  initialTradingName = '',
  onCreated,
}: Props) {
  const create = useCreateCustomer();

  const [tradingName, setTradingName] = useState(initialTradingName);
  const [legalName, setLegalName] = useState('');
  const [vatId, setVatId] = useState('');
  const [phone, setPhone] = useState('');
  const [paymentDays, setPaymentDays] = useState('0');

  // Sync the pre-filled trading name when reopened with a new search query.
  useEffect(() => {
    if (open) {
      setTradingName(initialTradingName);
      setLegalName('');
      setVatId('');
      setPhone('');
      setPaymentDays('0');
    }
  }, [open, initialTradingName]);

  const canSave = tradingName.trim().length > 0 && !create.isPending;

  async function onSave() {
    if (!canSave) return;
    try {
      const created = await create.mutateAsync({
        trading_name: tradingName.trim(),
        legal_name: legalName.trim() || undefined,
        vat_id: vatId.trim() || undefined,
        phone: phone.trim() || undefined,
        payment_terms_days: Number.parseInt(paymentDays, 10) || 0,
      });
      toast.success('Πελάτης προστέθηκε');
      onCreated(created);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Αποτυχία δημιουργίας');
    }
  }

  return (
    <FullScreenSheet open={open} onClose={onClose}>
      {/* Header */}
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
          <svg width="14" height="14" viewBox="0 0 14 14">
            <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="text-eyebrow" style={{ fontSize: 9, marginBottom: 1 }}>
            Βήμα 1 · Πελάτης
          </div>
          <h3
            className="font-display"
            style={{ fontStyle: 'italic', fontSize: 19, color: 'var(--sage-800)', lineHeight: 1.1 }}
          >
            Νέος πελάτης
          </h3>
        </div>
      </div>

      {/* Form */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 20px 24px' }}>
        <Field
          label="Εμπορική επωνυμία"
          required
          value={tradingName}
          onChange={setTradingName}
          placeholder="π.χ. Anthotopos Athens"
          autoFocus
        />
        <Field
          label="Νομική επωνυμία"
          value={legalName}
          onChange={setLegalName}
          placeholder="π.χ. Ανθότοπος Αθηνών ΑΕ"
        />
        <Field
          label="ΑΦΜ"
          value={vatId}
          onChange={setVatId}
          placeholder="9 ψηφία"
          inputMode="numeric"
        />
        <Field
          label="Τηλέφωνο"
          value={phone}
          onChange={setPhone}
          placeholder="π.χ. 99123456"
          inputMode="tel"
        />
        <Field
          label="Ημέρες πληρωμής"
          value={paymentDays}
          onChange={setPaymentDays}
          inputMode="numeric"
        />
      </div>

      {/* Save bar */}
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
          disabled={!canSave}
          onClick={onSave}
          className="btn-primary ios-tap"
        >
          {create.isPending ? (
            <>
              <Loader2 size={16} color="var(--cream-50)" className="animate-spin" />
              Αποθήκευση…
            </>
          ) : (
            'Αποθήκευση πελάτη'
          )}
        </button>
      </div>
    </FullScreenSheet>
  );
}

interface FieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  autoFocus?: boolean;
  inputMode?: 'text' | 'numeric' | 'decimal' | 'email' | 'tel';
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  required,
  autoFocus,
  inputMode = 'text',
}: FieldProps) {
  return (
    <label style={{ display: 'block', marginBottom: 16 }}>
      <span
        className="text-eyebrow"
        style={{ fontSize: 9, marginBottom: 6, display: 'block', color: 'var(--ink-500)' }}
      >
        {label}
        {required && (
          <span style={{ color: 'var(--clay)', marginLeft: 4 }}>*</span>
        )}
      </span>
      <input
        type="text"
        inputMode={inputMode}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        style={{
          width: '100%',
          height: 46,
          padding: '0 14px',
          background: '#fff',
          border: '1px solid rgba(63,75,70,0.12)',
          borderRadius: 12,
          fontSize: 16,
          outline: 'none',
          transition: 'border-color 160ms ease, box-shadow 160ms ease',
        }}
        onFocus={(e) => {
          e.target.style.borderColor = 'var(--sage-400)';
          e.target.style.boxShadow = '0 0 0 3px rgba(63,107,92,0.15)';
        }}
        onBlur={(e) => {
          e.target.style.borderColor = 'rgba(63,75,70,0.12)';
          e.target.style.boxShadow = 'none';
        }}
      />
    </label>
  );
}

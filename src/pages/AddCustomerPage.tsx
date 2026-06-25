import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, Check, Plus } from 'lucide-react';
import CustomerFormField from '@/components/CustomerFormField';
import { readDeepLinkParam } from '@/lib/deep-link';
import { useCreateCustomer } from '@/lib/queries';
import type { Customer } from '@/types';

/**
 * Standalone "add customer" page. Two entry points:
 *  - The Home "Νέος πελάτης" button (blank form).
 *  - The iOS Shortcut deep-link /customers/new?name=…&phone=…&email=…
 *    which pre-fills the form from a phone contact.
 *
 * On save it offers to start a new order for the customer immediately
 * (navigates into the wizard with presetCustomer), or finish.
 */
export default function AddCustomerPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const create = useCreateCustomer();

  // Pre-fill from query params (the Shortcut path). Read once on mount —
  // these are the seed values; the user edits the controlled state below.
  const [tradingName, setTradingName] = useState(() => readDeepLinkParam(params, 'name'));
  const [legalName, setLegalName] = useState('');
  const [vatId, setVatId] = useState('');
  const [phone, setPhone] = useState(() => readDeepLinkParam(params, 'phone'));
  const [email, setEmail] = useState(() => readDeepLinkParam(params, 'email'));
  const [paymentDays, setPaymentDays] = useState('0');

  // After a successful save we hold the created customer to drive the
  // "Νέα παραγγελία τώρα;" success view.
  const [created, setCreated] = useState<Customer | null>(null);

  const canSave = tradingName.trim().length > 0 && !create.isPending;

  async function onSave() {
    if (!canSave) return;
    try {
      const c = await create.mutateAsync({
        trading_name: tradingName.trim(),
        legal_name: legalName.trim() || undefined,
        vat_id: vatId.trim() || undefined,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        payment_terms_days: Number.parseInt(paymentDays, 10) || 0,
      });
      setCreated(c);
      toast.success('Πελάτης προστέθηκε');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Αποτυχία δημιουργίας');
    }
  }

  return (
    <div className="min-h-screen pb-10" style={{ background: 'var(--cream-100)', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <header
        className="pt-safe"
        style={{ padding: '14px 20px 8px', display: 'flex', alignItems: 'center', gap: 12 }}
      >
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="Πίσω"
          className="ios-tap"
          style={{
            width: 36, height: 36, marginLeft: -8, borderRadius: 999,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--ink-700)',
          }}
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <div className="text-eyebrow">Πελάτης</div>
          <h1
            className="font-display"
            style={{ fontSize: 24, lineHeight: 1.05, color: 'var(--ink-900)', fontWeight: 500, marginTop: 2 }}
          >
            {created ? 'Προστέθηκε' : 'Νέος πελάτης'}
          </h1>
        </div>
      </header>

      {created ? (
        /* Success view — offer to start an order right away. */
        <div style={{ flex: 1, padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div
            style={{
              background: '#fff',
              borderRadius: 16,
              boxShadow: 'var(--shadow-card)',
              padding: 20,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}
          >
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
              <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink-900)' }}>
                {created.trading_name || created.legal_name}
              </div>
              <div className="font-mono-meta" style={{ fontSize: 12, color: 'var(--ink-500)', marginTop: 2 }}>
                {phone.trim() || 'χωρίς τηλέφωνο'}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => navigate('/orders/new', { state: { presetCustomer: created } })}
            className="btn-primary ios-tap"
            style={{ height: 54, fontSize: 16 }}
          >
            <Plus size={18} color="var(--cream-50)" strokeWidth={2} />
            Νέα παραγγελία τώρα
          </button>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="btn-secondary ios-tap"
            style={{ height: 48 }}
          >
            Τέλος
          </button>
        </div>
      ) : (
        <>
          {/* Form */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px 24px' }}>
            <CustomerFormField
              label="Εμπορική επωνυμία"
              required
              value={tradingName}
              onChange={setTradingName}
              placeholder="π.χ. Anthotopos Athens"
              autoFocus={!tradingName}
            />
            <CustomerFormField
              label="Νομική επωνυμία"
              value={legalName}
              onChange={setLegalName}
              placeholder="π.χ. Ανθότοπος Αθηνών ΑΕ"
            />
            <CustomerFormField
              label="ΑΦΜ"
              value={vatId}
              onChange={setVatId}
              placeholder="9 ψηφία"
              inputMode="numeric"
            />
            <CustomerFormField
              label="Τηλέφωνο"
              value={phone}
              onChange={setPhone}
              placeholder="π.χ. 99123456"
              inputMode="tel"
            />
            <CustomerFormField
              label="Email"
              value={email}
              onChange={setEmail}
              placeholder="π.χ. info@anthotopos.gr"
              inputMode="email"
            />
            <CustomerFormField
              label="Ημέρες πληρωμής"
              value={paymentDays}
              onChange={setPaymentDays}
              inputMode="numeric"
            />
          </div>

          {/* Save bar */}
          <div
            className="pb-safe"
            style={{ padding: '14px 20px 16px', background: '#fff', borderTop: '1px solid rgba(63,75,70,0.10)' }}
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
        </>
      )}
    </div>
  );
}

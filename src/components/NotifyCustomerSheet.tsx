import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { MobileSheet } from './MobileSheet';
import { normalizeCyprusPhone } from '@/lib/phone';
import { buildReadyMessage, buildChannelUrl, type NotifyChannel } from '@/lib/notify-message';
import { useNotifyCustomer } from '@/lib/queries';

interface Props {
  open: boolean;
  onClose: () => void;
  orderId: string;
  orderNumber: string;
  customerName: string;
  /** Phone from the order's primary contact (may be empty). */
  customerPhone: string | null | undefined;
}

const isAndroid = typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent);

const CHANNELS: { id: NotifyChannel; label: string; bg: string }[] = [
  { id: 'VIBER', label: 'Viber', bg: '#7360F2' },
  { id: 'WHATSAPP', label: 'WhatsApp', bg: '#25D366' },
  { id: 'SMS', label: 'SMS', bg: 'var(--sage-700)' },
];

export default function NotifyCustomerSheet({
  open, onClose, orderId, orderNumber, customerName, customerPhone,
}: Props) {
  const notify = useNotifyCustomer();
  const [message, setMessage] = useState('');
  const [phoneInput, setPhoneInput] = useState('');

  useEffect(() => {
    if (open) {
      setMessage(buildReadyMessage(customerName, orderNumber));
      setPhoneInput(customerPhone || '');
    }
  }, [open, customerName, orderNumber, customerPhone]);

  const resolvedPhone = normalizeCyprusPhone(phoneInput);
  const canSend = resolvedPhone.length >= 8;

  async function send(channel: NotifyChannel) {
    if (!canSend) {
      toast.error('Συμπλήρωσε ένα έγκυρο τηλέφωνο');
      return;
    }
    if (channel === 'VIBER') {
      try {
        await navigator.clipboard?.writeText(message);
        toast.success('Μήνυμα αντιγράφηκε — κάνε paste στο Viber');
      } catch {
        toast.message('Αντίγραψε το μήνυμα χειροκίνητα πριν στείλεις');
      }
    }
    notify.mutate({ orderId, channel });
    window.location.href = buildChannelUrl(channel, resolvedPhone, message, isAndroid);
    onClose();
  }

  return (
    <MobileSheet open={open} onClose={onClose} title="Ειδοποίηση πελάτη">
      {/* Scrollable fields + sticky channel bar — mirrors PdfActionSheet so
          Viber/WhatsApp/SMS stay visible above the Safari bottom toolbar. */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          minHeight: 0,
        }}
      >
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            padding: '4px 16px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          <div>
            <label
              className="text-eyebrow"
              style={{ display: 'block', marginBottom: 6, color: 'var(--ink-500)' }}
            >
              Τηλέφωνο πελάτη
            </label>
            <input
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value)}
              inputMode="tel"
              placeholder="π.χ. 99123456"
              style={{
                width: '100%', height: 44, padding: '0 12px',
                border: '1px solid rgba(63,75,70,0.18)', borderRadius: 12,
                fontSize: 15, outline: 'none', background: '#fff',
              }}
            />
            <div
              className="font-mono-meta"
              style={{ fontSize: 12, color: canSend ? 'var(--sage-700)' : 'var(--clay)', marginTop: 6 }}
            >
              {resolvedPhone ? `Αποστολή σε: ${resolvedPhone}` : 'Δεν υπάρχει τηλέφωνο — πρόσθεσέ το'}
            </div>
          </div>

          <div>
            <label
              className="text-eyebrow"
              style={{ display: 'block', marginBottom: 6, color: 'var(--ink-500)' }}
            >
              Μήνυμα
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              style={{
                width: '100%', padding: 12, resize: 'vertical',
                border: '1px solid rgba(63,75,70,0.18)', borderRadius: 12,
                fontSize: 15, lineHeight: 1.4, outline: 'none', background: '#fff',
                fontFamily: 'inherit',
              }}
            />
          </div>
        </div>

        <div
          className="pb-safe"
          style={{
            flexShrink: 0,
            padding: '12px 16px 14px',
            borderTop: '1px solid rgba(63,75,70,0.08)',
            background: 'var(--cream-50)',
          }}
        >
          <div style={{ display: 'flex', gap: 8 }}>
            {CHANNELS.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => void send(c.id)}
                disabled={!canSend}
                className="ios-tap"
                style={{
                  flex: 1, height: 50, borderRadius: 14, border: 0,
                  background: canSend ? c.bg : 'var(--cream-200)',
                  color: canSend ? '#fff' : 'var(--ink-500)',
                  fontSize: 15, fontWeight: 600,
                  cursor: canSend ? 'pointer' : 'default',
                }}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </MobileSheet>
  );
}

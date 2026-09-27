import { useState } from 'react';
import { toast } from 'sonner';
import { Download, Mail, Share2 } from 'lucide-react';
import { MobileSheet } from './MobileSheet';
import { apiFetch, ApiError } from '@/lib/api';
import { fmtEUR, fmtLongDate } from '@/lib/format';
import { buildQuoteMessage, quoteTotals } from '@/lib/quote';
import type { QuoteDetail } from '@/types';

interface Props {
  open: boolean;
  onClose: () => void;
  detail: QuoteDetail;
  /** Moves the quote to SENT through /api/quotes/save (a no-op when it is
   *  already SENT). Returns false when Bloom refused or the user cancelled. */
  ensureSent: (action: string) => Promise<boolean>;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Send a quote to the customer. The quote is moved to SENT first (so Bloom
 * runs its send-time rules: unpriced check, group prices, spec freeze, cost
 * stamp), then the PDF goes out through one of:
 *  - the native share sheet (Viber / WhatsApp / Mail… with the PDF attached),
 *  - a Gmail draft created by Bloom (POST /api/quotes/:id/send-gmail),
 *  - a plain download.
 */
export default function SendQuoteSheet({ open, onClose, detail, ensureSent }: Props) {
  const { quote, customer } = detail;
  const customerName = customer?.trading_name || customer?.legal_name || '';
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState<null | 'share' | 'gmail' | 'download'>(null);
  // iOS only allows navigator.share() close to a tap. If the save + PDF took
  // too long the first attempt is refused; keep the file for a second tap.
  const [pendingShare, setPendingShare] = useState<File | null>(null);

  // Re-seed the editable fields each time the sheet opens (React's
  // "adjust state when a prop changes" pattern — no effect needed).
  const [seededFor, setSeededFor] = useState(false);
  if (open !== seededFor) {
    setSeededFor(open);
    if (open) {
      setMessage(buildQuoteMessage({
        customerName,
        quoteNumber: quote.quote_number,
        total: fmtEUR(quoteTotals(detail.lines).total),
        validUntil: fmtLongDate(quote.valid_until),
      }));
      setEmail(customer?.email || '');
      setPendingShare(null);
    }
  }

  const filename = `${quote.quote_number}.pdf`;

  async function buildPdf(): Promise<Blob> {
    const { generateQuotePdf } = await import('@/lib/pdf-quote');
    // The PDF reflects the state the customer receives: SENT.
    const status = quote.status === 'DRAFT' ? 'SENT' : quote.status;
    return generateQuotePdf({ ...detail, quote: { ...detail.quote, status } });
  }

  async function share(file: File): Promise<void> {
    try {
      await navigator.share({ files: [file], title: `Προσφορά ${quote.quote_number}`, text: message });
      toast.success('Η προσφορά κοινοποιήθηκε');
      setPendingShare(null);
      onClose();
    } catch (err) {
      const name = (err as DOMException)?.name;
      if (name === 'AbortError') return;
      if (name === 'NotAllowedError') {
        setPendingShare(file);
        return;
      }
      throw err;
    }
  }

  async function onShare() {
    setBusy('share');
    try {
      if (!(await ensureSent('PWA_SEND_SHARE'))) return;
      const blob = await buildPdf();
      const file = new File([blob], filename, { type: 'application/pdf' });
      if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
        await share(file);
      } else {
        const { downloadPdf } = await import('@/lib/pdf-sales-doc');
        downloadPdf(blob, filename);
        await copyMessage();
        toast.success('Το PDF κατέβηκε και το μήνυμα αντιγράφηκε');
        onClose();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Αποτυχία αποστολής');
    } finally {
      setBusy(null);
    }
  }

  async function onGmail() {
    if (!EMAIL_RE.test(email.trim())) {
      toast.error('Συμπλήρωσε ένα έγκυρο email');
      return;
    }
    setBusy('gmail');
    try {
      if (!(await ensureSent('PWA_SEND_GMAIL'))) return;
      const blob = await buildPdf();
      const { blobToBase64 } = await import('@/lib/pdf-sales-doc');
      const res = await apiFetch<{ ok: boolean; gmail_draft_url?: string }>(
        `/api/quotes/${encodeURIComponent(quote.id)}/send-gmail`,
        {
          method: 'POST',
          body: JSON.stringify({
            recipient: email.trim(),
            subject: `Προσφορά ${quote.quote_number} — Andreas Pakkoutis & Sons Ltd`,
            body: message,
            pdf_base64: await blobToBase64(blob),
            pdf_filename: filename,
          }),
        },
      );
      toast.success('Δημιουργήθηκε πρόχειρο στο Gmail', {
        description: 'Έλεγξέ το και πάτα αποστολή από το Gmail.',
        action: res.gmail_draft_url
          ? { label: 'Άνοιγμα', onClick: () => window.open(res.gmail_draft_url, '_blank') }
          : undefined,
      });
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.status === 412) {
        toast.error('Το Gmail δεν είναι συνδεδεμένο στο Bloom', {
          description: 'Σύνδεσέ το από το Bloom → Ρυθμίσεις → Gmail.',
        });
      } else {
        toast.error(err instanceof Error ? err.message : 'Αποτυχία Gmail');
      }
    } finally {
      setBusy(null);
    }
  }

  async function onDownload() {
    setBusy('download');
    try {
      const blob = await buildPdf();
      const { downloadPdf } = await import('@/lib/pdf-sales-doc');
      downloadPdf(blob, filename);
    } catch {
      toast.error('Αποτυχία δημιουργίας PDF');
    } finally {
      setBusy(null);
    }
  }

  async function copyMessage() {
    try {
      await navigator.clipboard?.writeText(message);
    } catch {
      /* clipboard refused — the message is still visible to copy by hand */
    }
  }

  const willSend = quote.status === 'DRAFT' || quote.status === 'EXPIRED';

  return (
    <MobileSheet open={open} onClose={onClose} title="Αποστολή προσφοράς">
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '4px 16px 12px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ fontSize: 13, color: 'var(--ink-500)', lineHeight: 1.45, margin: 0 }}>
            {willSend ? 'Η προσφορά θα σημειωθεί ως «Εστάλη» στο Bloom πριν φύγει το PDF. ' : ''}
            Η κοινοποίηση ανοίγει Viber, WhatsApp ή Mail με το PDF συνημμένο.
          </p>
          <div>
            <label htmlFor="send-quote-message" className="text-eyebrow" style={{ display: 'block', marginBottom: 6, color: 'var(--ink-500)' }}>
              Μήνυμα
            </label>
            <textarea
              id="send-quote-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              style={{
                width: '100%', padding: 12, resize: 'vertical',
                border: '1px solid rgba(63,75,70,0.18)', borderRadius: 12,
                fontSize: 15, lineHeight: 1.4, outline: 'none', background: '#fff', fontFamily: 'inherit',
              }}
            />
          </div>
          <div>
            <label htmlFor="send-quote-email" className="text-eyebrow" style={{ display: 'block', marginBottom: 6, color: 'var(--ink-500)' }}>
              Email πελάτη (για Gmail)
            </label>
            <input
              id="send-quote-email"
              type="email"
              inputMode="email"
              autoComplete="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="π.χ. info@gardencenter.cy"
              style={{
                width: '100%', height: 44, padding: '0 12px',
                border: '1px solid rgba(63,75,70,0.18)', borderRadius: 12,
                fontSize: 15, outline: 'none', background: '#fff',
              }}
            />
          </div>
        </div>

        <div
          style={{
            flexShrink: 0, paddingTop: 12, paddingLeft: 16, paddingRight: 16,
            paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 16px)',
            borderTop: '1px solid rgba(63,75,70,0.08)', background: 'var(--cream-50)',
            display: 'flex', flexDirection: 'column', gap: 8,
          }}
        >
          {pendingShare ? (
            <button type="button" className="btn-primary ios-tap" onClick={() => void share(pendingShare)}>
              <Share2 size={18} /> Άνοιγμα κοινοποίησης
            </button>
          ) : (
            <button type="button" className="btn-primary ios-tap" disabled={!!busy} onClick={() => void onShare()}>
              <Share2 size={18} />
              {busy === 'share' ? 'Ετοιμασία…' : 'Κοινοποίηση PDF'}
            </button>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn-secondary ios-tap" disabled={!!busy} onClick={() => void onGmail()}>
              <Mail size={17} /> {busy === 'gmail' ? 'Gmail…' : 'Πρόχειρο Gmail'}
            </button>
            <button type="button" className="btn-secondary ios-tap" disabled={!!busy} onClick={() => void onDownload()}>
              <Download size={17} /> {busy === 'download' ? 'PDF…' : 'Λήψη PDF'}
            </button>
          </div>
        </div>
      </div>
    </MobileSheet>
  );
}

import { useMemo, useState } from 'react';
import { X, Search, Loader2, UserRound } from 'lucide-react';
import { useGoogleContacts, type GoogleContact } from '@/lib/queries';
import { normalizeForSearch } from '@/lib/search';
import { ApiError } from '@/lib/api';

interface Props {
  open: boolean;
  onClose: () => void;
  onPick: (contact: GoogleContact) => void;
}

/**
 * Full-screen picker over the connected Google account's contacts. Fetches
 * the full list once (via /api/google-contacts) and filters client-side,
 * diacritic-insensitive. Picking a contact hands { name, phone, email } back
 * to AddCustomerPage to pre-fill the new-customer form.
 *
 * Handles the two recoverable backend states (Google not linked / contacts
 * scope not granted) with a clear instruction rather than a raw error.
 */
export default function GoogleContactsPicker({ open, onClose, onPick }: Props) {
  const [query, setQuery] = useState('');
  const { data: contacts = [], isLoading, isError, error } = useGoogleContacts(open);

  const errorPayload =
    error instanceof ApiError && error.payload && typeof error.payload === 'object'
      ? (error.payload as { error?: unknown; detail?: unknown })
      : null;
  const errorCode = errorPayload ? String(errorPayload.error ?? '') : '';
  const errorDetail = errorPayload && errorPayload.detail ? String(errorPayload.detail) : '';

  const enriched = useMemo(
    () =>
      contacts.map((c) => ({
        contact: c,
        blob: normalizeForSearch(`${c.name} ${c.phone} ${c.email}`),
      })),
    [contacts],
  );

  const filtered = useMemo(() => {
    const q = normalizeForSearch(query.trim());
    const base = q ? enriched.filter((e) => e.blob.includes(q)) : enriched;
    return base.slice(0, 100);
  }, [enriched, query]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Επιλογή από Google επαφές"
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
            width: 36, height: 36, borderRadius: 999, border: 0, background: 'transparent',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--ink-700)', cursor: 'pointer',
          }}
        >
          <X size={20} />
        </button>
        <div className="font-display" style={{ fontSize: 18, fontWeight: 500, fontStyle: 'italic', color: 'var(--ink-900)', flex: 1 }}>
          Google επαφές
        </div>
      </div>

      {/* Search */}
      <div style={{ padding: '14px 16px', position: 'relative', background: '#fff' }}>
        <Search style={{ position: 'absolute', left: 30, top: 28, color: 'var(--ink-500)' }} size={16} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Αναζήτηση επαφής"
          autoFocus
          style={{
            width: '100%', height: 44, paddingLeft: 38, paddingRight: 14,
            background: 'var(--cream-200, #F4F1E8)', border: '1px solid rgba(63,75,70,0.10)',
            borderRadius: 12, fontSize: 15, outline: 'none',
          }}
        />
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 16px 24px' }}>
        {isLoading && (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--ink-500)' }}>
            <Loader2 size={22} className="animate-spin" style={{ color: 'var(--sage-700)' }} />
            <div style={{ fontSize: 14, marginTop: 10 }}>Φόρτωση επαφών…</div>
          </div>
        )}

        {isError && (errorCode === 'not_connected' || errorCode === 'scope_missing' || errorCode === 'api_disabled') && (
          <div
            style={{
              background: '#fff', borderRadius: 14, boxShadow: 'var(--shadow-card)',
              padding: 20, marginTop: 8, lineHeight: 1.5,
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink-900)', marginBottom: 8 }}>
              {errorCode === 'not_connected'
                ? 'Δεν έχει συνδεθεί λογαριασμός επαφών'
                : errorCode === 'api_disabled'
                  ? 'Το People API δεν είναι ενεργό'
                  : 'Λείπει η άδεια για τις επαφές'}
            </div>
            {errorCode === 'api_disabled' ? (
              <p style={{ fontSize: 14, color: 'var(--ink-500)' }}>
                Ενεργοποίησε το <strong>People API</strong> στο Google Cloud Console του project
                (APIs &amp; Services → Library → People API → Enable), μετά δοκίμασε ξανά.
              </p>
            ) : errorCode === 'scope_missing' ? (
              <p style={{ fontSize: 14, color: 'var(--ink-500)' }}>
                Ο λογαριασμός συνδέθηκε αλλά <strong>δεν δόθηκε η άδεια επαφών</strong>. Από το desktop:
                {' '}<strong>Ρυθμίσεις → Google Contacts → Disconnect → Connect ξανά</strong>, και στην
                οθόνη του Google <strong>τσέκαρε/άφησε ενεργό το «See your contacts»</strong>.
              </p>
            ) : (
              <p style={{ fontSize: 14, color: 'var(--ink-500)' }}>
                Σύνδεσε τον Google λογαριασμό που έχει τις επαφές σου από το desktop:
                {' '}<strong>smartquotations.eu → Ρυθμίσεις → Google Contacts</strong> →
                «Connect Google Contacts». Μπορεί να είναι <strong>διαφορετικός</strong> λογαριασμός
                από το Gmail.
              </p>
            )}
            {errorDetail && (
              <p style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--ink-300)', marginTop: 10, wordBreak: 'break-word' }}>
                {errorDetail}
              </p>
            )}
          </div>
        )}

        {isError && errorCode !== 'not_connected' && errorCode !== 'scope_missing' && errorCode !== 'api_disabled' && (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--clay)', fontSize: 14 }}>
            Αποτυχία φόρτωσης επαφών. Δοκίμασε ξανά.
          </div>
        )}

        {!isLoading && !isError && filtered.length === 0 && (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--ink-500)', fontSize: 14 }}>
            {query ? 'Καμία επαφή.' : 'Δεν βρέθηκαν επαφές.'}
          </div>
        )}

        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {filtered.map((e, i) => {
            const c = e.contact;
            const sub = [c.phone, c.email].filter(Boolean).join(' · ');
            return (
              <li
                key={`${c.name}-${c.phone}-${i}`}
                style={{ background: '#fff', borderRadius: 12, marginBottom: 8, boxShadow: 'var(--shadow-card)' }}
              >
                <button
                  type="button"
                  onClick={() => onPick(c)}
                  className="ios-tap"
                  style={{
                    width: '100%', padding: '12px 14px', background: 'transparent', border: 0,
                    cursor: 'pointer', textAlign: 'left',
                    display: 'flex', alignItems: 'center', gap: 12,
                  }}
                >
                  <div
                    aria-hidden="true"
                    style={{
                      width: 38, height: 38, borderRadius: 999, flexShrink: 0,
                      background: 'var(--sage-100, #E6EEE2)', color: 'var(--sage-800)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <UserRound size={18} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink-900)' }}>{c.name}</div>
                    {sub && (
                      <div
                        className="font-mono-meta"
                        style={{
                          fontSize: 12, color: 'var(--ink-500)', marginTop: 2,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}
                      >
                        {sub}
                      </div>
                    )}
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

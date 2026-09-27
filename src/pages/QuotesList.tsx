import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import { useQuotes, useCustomers } from '@/lib/queries';
import { fmtEUR, fmtShortDate, localDayKey } from '@/lib/format';
import { normalizeForSearch } from '@/lib/search';
import { compareQuotesNewestFirst, displayQuoteStatus } from '@/lib/quote';
import QuoteStatusBadge from '@/components/QuoteStatusBadge';
import BottomNav from '@/components/BottomNav';
import type { Quote, QuoteStatus } from '@/types';

type FilterId = 'OPEN' | 'DRAFT' | 'SENT' | 'EXPIRED' | 'ACCEPTED' | 'REJECTED' | 'ALL';

const FILTER_DEFS: { id: FilterId; label: string }[] = [
  { id: 'OPEN', label: 'Ανοιχτές' },
  { id: 'DRAFT', label: 'Πρόχειρες' },
  { id: 'SENT', label: 'Εστάλησαν' },
  { id: 'EXPIRED', label: 'Έληξαν' },
  { id: 'ACCEPTED', label: 'Αποδεκτές' },
  { id: 'REJECTED', label: 'Απορρίφθηκαν' },
  { id: 'ALL', label: 'Όλες' },
];

function matches(filter: FilterId, shown: QuoteStatus): boolean {
  switch (filter) {
    case 'OPEN': return shown === 'DRAFT' || shown === 'SENT' || shown === 'EXPIRED';
    case 'ACCEPTED': return shown === 'ACCEPTED' || shown === 'CONVERTED';
    case 'ALL': return shown !== 'SUPERSEDED';
    default: return shown === filter;
  }
}

function todayLocal(): string {
  return localDayKey(new Date().toISOString());
}

export default function QuotesList() {
  const { data: quotes = [], isLoading } = useQuotes();
  const { data: customers = [] } = useCustomers();
  const [search, setSearch] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();
  // Home's counters deep-link here with ?status=OPEN / ?status=SENT.
  const [filter, setFilter] = useState<FilterId>(() => {
    const status = searchParams.get('status');
    return status && FILTER_DEFS.some((f) => f.id === status) ? (status as FilterId) : 'OPEN';
  });
  // Consume the param so back-navigation lands on a clean URL.
  useEffect(() => {
    if (searchParams.get('status')) setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  const today = todayLocal();
  const customerLabel = (id: string) => {
    const c = customers.find((x) => x.id === id);
    return c?.trading_name || c?.legal_name || 'Άγνωστος πελάτης';
  };

  const rows = useMemo(
    () => [...quotes].sort(compareQuotesNewestFirst).map((q) => ({ q, shown: displayQuoteStatus(q, today) })),
    [quotes, today],
  );

  const counts = useMemo(() => {
    const out: Partial<Record<FilterId, number>> = {};
    for (const f of FILTER_DEFS) out[f.id] = rows.filter((r) => matches(f.id, r.shown)).length;
    return out;
  }, [rows]);

  const filtered = useMemo(() => {
    const q = normalizeForSearch(search.trim());
    return rows.filter(({ q: quote, shown }) => {
      if (!matches(filter, shown)) return false;
      if (!q) return true;
      return normalizeForSearch(customerLabel(quote.customer_id)).includes(q)
        || normalizeForSearch(quote.quote_number).includes(q);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, customers, filter, search]);

  const dateLabel = new Date().toLocaleDateString('el-GR', { day: 'numeric', month: 'long' });

  return (
    <div className="min-h-screen pb-24">
      <header className="pt-safe" style={{ padding: '14px 20px 0', display: 'flex', alignItems: 'flex-end', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div className="text-eyebrow">{dateLabel} · {counts.OPEN ?? 0} ανοιχτές</div>
          <h1 className="font-display" style={{ fontSize: 30, lineHeight: 1.05, marginTop: 4, fontWeight: 500 }}>
            Προσφορές
          </h1>
        </div>
        <Link
          to="/quotes/new"
          aria-label="Νέα προσφορά"
          className="ios-tap"
          style={{
            width: 40, height: 40, borderRadius: 999, background: 'var(--sage-700)', color: 'var(--cream-50)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--shadow-cta)',
          }}
        >
          <Plus size={20} />
        </Link>
      </header>

      <div style={{ padding: '18px 20px 0', position: 'relative' }}>
        <Search className="absolute pointer-events-none" style={{ left: 32, top: 32, color: 'var(--ink-500)' }} size={16} />
        <input
          id="quotes-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Αναζήτηση πελάτη ή QT-…"
          style={{
            width: '100%', height: 44, paddingLeft: 40, paddingRight: 14,
            background: 'rgba(255,255,255,0.85)', border: '1px solid rgba(63,75,70,0.08)',
            borderRadius: 12, fontSize: 15, outline: 'none',
          }}
        />
      </div>

      <div className="chip-strip" style={{ padding: '14px 0 0' }}>
        <div style={{ display: 'flex', gap: 8, padding: '0 20px', overflowX: 'auto', flexWrap: 'nowrap', scrollbarWidth: 'none' }}>
          {FILTER_DEFS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`chip ${filter === f.id ? 'chip-active' : ''}`}
            >
              {f.label}
              {(counts[f.id] ?? 0) > 0 && (
                <span className="font-mono-meta" style={{ fontSize: 10, opacity: 0.7 }}>{counts[f.id]}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <section style={{ padding: '18px 20px 0' }}>
        <div className="folio" style={{ marginBottom: 10 }}>
          <span className="folio-num">{String(filtered.length).padStart(2, '0')}</span>
          <span>αποτελέσματα</span>
        </div>
        {isLoading ? (
          <p className="text-ink-500 text-sm">Φόρτωση…</p>
        ) : filtered.length === 0 ? (
          <p className="text-center text-ink-500 py-8 text-sm">Καμία προσφορά</p>
        ) : (
          <div style={{ background: '#fff', borderRadius: 16, boxShadow: 'var(--shadow-card)', overflow: 'hidden' }}>
            {filtered.map(({ q, shown }, i) => (
              <QuoteRow key={q.id} quote={q} shown={shown} first={i === 0} customer={customerLabel(q.customer_id)} />
            ))}
          </div>
        )}
      </section>

      <BottomNav />
    </div>
  );
}

function QuoteRow({ quote, shown, first, customer }: { quote: Quote; shown: QuoteStatus; first: boolean; customer: string }) {
  const meta = [
    quote.quote_number,
    quote.lines_count != null ? `${quote.lines_count} γρ.` : null,
    quote.linked_order_id ? 'παραγγελία ✓' : shown === 'EXPIRED' ? `έληξε ${fmtShortDate(quote.valid_until)}` : `έως ${fmtShortDate(quote.valid_until)}`,
  ].filter(Boolean).join(' · ');
  return (
    <Link to={`/quotes/${quote.id}`}>
      {!first && <div className="hairline" style={{ margin: '0 16px' }} />}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontWeight: 500, fontSize: 15, color: 'var(--ink-900)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {customer}
          </p>
          <p className="font-mono-meta" style={{ fontSize: 11, color: 'var(--ink-500)', marginTop: 3, letterSpacing: '0.02em' }}>
            {meta}
          </p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5 }}>
          {quote.total_value != null && (
            <span className="font-mono-meta" style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink-900)' }}>
              {fmtEUR(quote.total_value)}
              <span style={{ fontSize: 9, color: 'var(--ink-300)', marginLeft: 3 }}>καθ.</span>
            </span>
          )}
          <QuoteStatusBadge status={shown} hasOrder={!!quote.linked_order_id} />
        </div>
      </div>
    </Link>
  );
}

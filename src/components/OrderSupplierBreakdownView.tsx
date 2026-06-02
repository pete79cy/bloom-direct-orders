import { useEffect } from 'react';
import { X, Truck, Sprout, Phone } from 'lucide-react';
import { useOrderSupplierBreakdown } from '@/lib/queries';
import { prettyScientificName, cleanSizeSummary } from '@/lib/plant-display';

interface Props {
  open: boolean;
  onClose: () => void;
  orderId: string;
  orderNumber: string;
  customerName: string;
}

/**
 * Full-screen read-only view of an order grouped by supplier — answers
 * "for this order, who supplies which plants, and how many do I need to
 * order from each?". Suppliers are alphabetically sorted by the server;
 * own-production (supplier=null) is the last group.
 *
 * The data is fetched lazily via /api/orders/:id/supplier-orders only when
 * the overlay opens — the response joins supplier_products + supplier_prices
 * and is heavier than a normal order detail.
 */
export default function OrderSupplierBreakdownView({
  open, onClose, orderId, orderNumber, customerName,
}: Props) {
  const { data, isLoading, isError, error } = useOrderSupplierBreakdown(orderId, open);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const groups = data?.groups ?? [];
  const totalQty = groups.reduce(
    (s, g) => s + g.lines.reduce((acc, l) => acc + (l.qty || 0), 0),
    0,
  );
  const totalLines = groups.reduce((s, g) => s + g.lines.length, 0);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Ανά προμηθευτή"
      style={{
        position: 'fixed', inset: 0, zIndex: 1200,
        background: 'var(--cream-100, #FBFAF6)',
        color: 'var(--ink-900)',
        display: 'flex', flexDirection: 'column',
        animation: 'presentIn 180ms cubic-bezier(0.23,1,0.32,1)',
      }}
    >
      <button
        type="button"
        aria-label="Κλείσιμο"
        onClick={onClose}
        className="ios-tap"
        style={{
          position: 'absolute',
          top: 'calc(env(safe-area-inset-top,0px) + 8px)',
          right: 12,
          width: 44, height: 44,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'transparent', border: 0, color: 'var(--ink-900)',
          cursor: 'pointer',
        }}
      >
        <X size={28} strokeWidth={2.5} />
      </button>

      {/* Header */}
      <div style={{ padding: 'calc(env(safe-area-inset-top,0px) + 20px) 24px 12px' }}>
        <div
          className="font-mono-meta"
          style={{ fontSize: 11, color: 'var(--ink-500)', letterSpacing: '0.06em' }}
        >
          {orderNumber} · Ανά Προμηθευτή
        </div>
        <div
          className="font-display"
          style={{
            fontSize: 28,
            fontWeight: 500,
            fontStyle: 'italic',
            lineHeight: 1.1,
            paddingRight: 48,
            marginTop: 4,
            color: 'var(--ink-900)',
          }}
        >
          {customerName}
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 16px 0' }}>
        {isLoading && (
          <div style={{ padding: '24px 8px', fontSize: 14, color: 'var(--ink-500)' }}>
            Φόρτωση κατανομής…
          </div>
        )}
        {isError && (
          <div
            style={{
              margin: '8px 8px 12px',
              padding: '14px 16px',
              borderRadius: 12,
              background: '#fdecec',
              color: '#a3211a',
              fontSize: 13,
              lineHeight: 1.5,
            }}
          >
            Αποτυχία φόρτωσης. {error instanceof Error ? error.message : ''}
          </div>
        )}
        {!isLoading && !isError && groups.length === 0 && (
          <div style={{ padding: '24px 8px', fontSize: 14, color: 'var(--ink-500)' }}>
            Καμία γραμμή.
          </div>
        )}

        {groups.map((g, i) => {
          const isOwn = g.supplier === null;
          const groupQty = g.lines.reduce((s, l) => s + (l.qty || 0), 0);
          return (
            <section
              key={g.supplier?.id ?? `own-${i}`}
              style={{
                background: '#fff',
                borderRadius: 14,
                boxShadow: 'var(--shadow-card)',
                marginBottom: 12,
                overflow: 'hidden',
              }}
            >
              {/* Group header */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '12px 14px',
                  background: isOwn
                    ? 'var(--sage-100, #E7EFE2)'
                    : 'var(--cream-200, #F4F1E8)',
                  borderBottom: '1px solid rgba(63,75,70,0.08)',
                }}
              >
                <div
                  aria-hidden="true"
                  style={{
                    width: 36, height: 36, borderRadius: 999,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: isOwn ? 'var(--sage-700)' : 'var(--sage-800)',
                    color: 'var(--cream-50, #FDFCF8)',
                    flexShrink: 0,
                  }}
                >
                  {isOwn ? <Sprout size={18} /> : <Truck size={18} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    className="font-display"
                    style={{
                      fontSize: 17,
                      fontStyle: 'italic',
                      fontWeight: 500,
                      lineHeight: 1.15,
                      color: 'var(--ink-900)',
                    }}
                  >
                    {isOwn ? 'Ιδιοπαραγωγή' : g.supplier!.name}
                  </div>
                  {!isOwn && g.supplier?.phone ? (
                    <a
                      href={`tel:${g.supplier.phone}`}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        marginTop: 2,
                        fontSize: 11,
                        color: 'var(--sage-700)',
                        textDecoration: 'none',
                      }}
                    >
                      <Phone size={11} strokeWidth={2} />
                      {g.supplier.phone}
                    </a>
                  ) : null}
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div
                    className="font-mono-meta"
                    style={{ fontSize: 18, fontWeight: 600, color: 'var(--ink-900)' }}
                  >
                    {groupQty}
                  </div>
                  <div
                    className="font-mono-meta"
                    style={{
                      fontSize: 9,
                      color: 'var(--ink-500)',
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                    }}
                  >
                    τεμ · {g.lines.length} {g.lines.length === 1 ? 'είδος' : 'είδη'}
                  </div>
                </div>
              </div>

              {/* Lines */}
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {g.lines.map((l, j) => {
                  const sci = prettyScientificName(l.plant_scientific_name);
                  const name = sci || l.plant_common_name || l.description || l.variant_code;
                  const size = cleanSizeSummary(l.size_summary);
                  return (
                    <li
                      key={`${l.variant_id ?? 'no-variant'}-${l.line_no}-${j}`}
                      style={{
                        padding: '11px 14px',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 12,
                        borderTop: j === 0 ? 'none' : '1px solid rgba(63,75,70,0.06)',
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          className="font-display"
                          style={{
                            fontSize: 14,
                            fontStyle: 'italic',
                            fontWeight: 500,
                            color: 'var(--ink-900)',
                            lineHeight: 1.25,
                          }}
                        >
                          {name}
                        </div>
                        {size ? (
                          <div
                            className="font-mono-meta"
                            style={{
                              fontSize: 10,
                              color: 'var(--ink-500)',
                              letterSpacing: '0.05em',
                              textTransform: 'uppercase',
                              marginTop: 2,
                            }}
                          >
                            {size}
                          </div>
                        ) : null}
                      </div>
                      <div
                        className="font-mono-meta"
                        style={{
                          fontSize: 18,
                          fontWeight: 600,
                          color: 'var(--sage-800)',
                          whiteSpace: 'nowrap',
                          minWidth: 40,
                          textAlign: 'right',
                        }}
                      >
                        {l.qty}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>

      {/* Footer totals — total qty + group count, so you know what you're
          looking at in one glance. */}
      <div
        style={{
          padding: '14px 24px calc(env(safe-area-inset-bottom,0px) + 18px)',
          borderTop: '2px solid var(--sage-700)',
          background: 'var(--cream-100)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
        }}
      >
        <div>
          <div
            className="font-display"
            style={{
              fontSize: 18,
              fontStyle: 'italic',
              fontWeight: 500,
              color: 'var(--sage-800)',
            }}
          >
            Σύνολο
          </div>
          <div
            className="font-mono-meta"
            style={{
              fontSize: 10,
              color: 'var(--ink-500)',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              marginTop: 2,
            }}
          >
            {groups.length} {groups.length === 1 ? 'προμηθευτής' : 'προμηθευτές'} · {totalLines} {totalLines === 1 ? 'είδος' : 'είδη'}
          </div>
        </div>
        <div
          className="font-mono-meta"
          style={{
            fontSize: 36,
            fontWeight: 600,
            lineHeight: 1,
            color: 'var(--sage-800)',
          }}
        >
          {totalQty}
          <span style={{ fontSize: 14, marginLeft: 4, color: 'var(--ink-500)' }}>τεμ</span>
        </div>
      </div>
    </div>
  );
}

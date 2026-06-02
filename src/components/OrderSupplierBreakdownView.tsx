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
      <div style={{ padding: 'calc(env(safe-area-inset-top,0px) + 20px) 24px 14px' }}>
        <div
          className="font-mono-meta"
          style={{ fontSize: 13, color: 'var(--ink-500)', letterSpacing: '0.06em' }}
        >
          {orderNumber} · ΑΝΑ ΠΡΟΜΗΘΕΥΤΗ
        </div>
        <div
          className="font-display"
          style={{
            fontSize: 30,
            fontWeight: 500,
            fontStyle: 'italic',
            lineHeight: 1.1,
            paddingRight: 48,
            marginTop: 6,
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
              {/* Group header — bigger touch + readability target, this is
                  what the user scans first in sunlight to pick a card. */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '16px 16px',
                  background: isOwn
                    ? 'var(--sage-100, #E7EFE2)'
                    : 'var(--cream-200, #F4F1E8)',
                  borderBottom: '1px solid rgba(63,75,70,0.08)',
                }}
              >
                <div
                  aria-hidden="true"
                  style={{
                    width: 44, height: 44, borderRadius: 999,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: isOwn ? 'var(--sage-700)' : 'var(--sage-800)',
                    color: 'var(--cream-50, #FDFCF8)',
                    flexShrink: 0,
                  }}
                >
                  {isOwn ? <Sprout size={22} /> : <Truck size={22} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 22,
                      fontWeight: 700,
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
                        gap: 5,
                        marginTop: 4,
                        fontSize: 14,
                        color: 'var(--sage-700)',
                        textDecoration: 'none',
                        fontWeight: 500,
                      }}
                    >
                      <Phone size={13} strokeWidth={2} />
                      {g.supplier.phone}
                    </a>
                  ) : null}
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div
                    className="font-mono-meta"
                    style={{ fontSize: 26, fontWeight: 700, color: 'var(--ink-900)', lineHeight: 1 }}
                  >
                    {groupQty}
                  </div>
                  <div
                    className="font-mono-meta"
                    style={{
                      fontSize: 11,
                      color: 'var(--ink-500)',
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      marginTop: 3,
                    }}
                  >
                    τεμ · {g.lines.length} {g.lines.length === 1 ? 'είδος' : 'είδη'}
                  </div>
                </div>
              </div>

              {/* Lines — Greek common name first (this is a sourcing view
                  for the operator, not a botanical reference). Scientific
                  name as fallback for catalogue entries that don't have
                  a common name yet; description for free-text / draft
                  lines. Fonts bumped meaningfully (~50%) vs the original
                  spec: this overlay is meant to be read in greenhouse
                  light, often at arm's length while loading a truck. */}
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {g.lines.map((l, j) => {
                  const common = l.plant_common_name?.trim();
                  const sci = prettyScientificName(l.plant_scientific_name);
                  const name = common || sci || l.description || l.variant_code;
                  const size = cleanSizeSummary(l.size_summary);
                  return (
                    <li
                      key={`${l.variant_id ?? 'no-variant'}-${l.line_no}-${j}`}
                      style={{
                        padding: '14px 16px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 14,
                        borderTop: j === 0 ? 'none' : '1px solid rgba(63,75,70,0.06)',
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 19,
                            fontWeight: 600,
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
                              fontSize: 13,
                              color: 'var(--ink-500)',
                              letterSpacing: '0.04em',
                              textTransform: 'uppercase',
                              marginTop: 3,
                            }}
                          >
                            {size}
                          </div>
                        ) : null}
                      </div>
                      <div
                        className="font-mono-meta"
                        style={{
                          fontSize: 28,
                          fontWeight: 700,
                          color: 'var(--sage-800)',
                          whiteSpace: 'nowrap',
                          minWidth: 52,
                          textAlign: 'right',
                          lineHeight: 1,
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
          looking at in one glance. Bumped for sunlight readability. */}
      <div
        style={{
          padding: '16px 24px calc(env(safe-area-inset-bottom,0px) + 20px)',
          borderTop: '2px solid var(--sage-700)',
          background: 'var(--cream-100)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div>
          <div
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: 'var(--sage-800)',
              lineHeight: 1.1,
            }}
          >
            Σύνολο
          </div>
          <div
            className="font-mono-meta"
            style={{
              fontSize: 12,
              color: 'var(--ink-500)',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              marginTop: 4,
            }}
          >
            {groups.length} {groups.length === 1 ? 'προμηθευτής' : 'προμηθευτές'} · {totalLines} {totalLines === 1 ? 'είδος' : 'είδη'}
          </div>
        </div>
        <div
          className="font-mono-meta"
          style={{
            fontSize: 44,
            fontWeight: 700,
            lineHeight: 1,
            color: 'var(--sage-800)',
            display: 'flex',
            alignItems: 'baseline',
            gap: 6,
          }}
        >
          {totalQty}
          <span style={{ fontSize: 18, color: 'var(--ink-500)', fontWeight: 600 }}>τεμ</span>
        </div>
      </div>
    </div>
  );
}

import type { QuoteStatus } from '@/types';
import { QUOTE_STATUS_LABEL } from '@/lib/quote';

const PILL_CLASS: Record<QuoteStatus, string> = {
  DRAFT: 'status-q-draft',
  SENT: 'status-q-sent',
  ACCEPTED: 'status-q-accepted',
  CONVERTED: 'status-q-converted',
  REJECTED: 'status-q-rejected',
  EXPIRED: 'status-q-expired',
  SUPERSEDED: 'status-q-superseded',
};

/** Quote counterpart of StatusBadge. Pass the DISPLAY status (see
 *  displayQuoteStatus) so an overdue SENT quote reads "Έληξε". A quote
 *  that produced an order shows "Παραγγελία" even while Bloom keeps it
 *  ACCEPTED — pass `hasOrder` for that. */
export default function QuoteStatusBadge({
  status, hasOrder = false, className,
}: { status: QuoteStatus; hasOrder?: boolean; className?: string }) {
  const shown: QuoteStatus = hasOrder && (status === 'ACCEPTED' || status === 'CONVERTED') ? 'CONVERTED' : status;
  return (
    <span className={`status-pill ${PILL_CLASS[shown]} ${className ?? ''}`.trim()}>
      {QUOTE_STATUS_LABEL[shown]}
    </span>
  );
}

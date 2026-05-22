import type { OrderStatus } from '@/types';

const LABELS: Record<OrderStatus, string> = {
  PENDING: 'Εκκρεμής',
  PREPARING: 'Ετοιμασία',
  READY: 'Έτοιμη',
  PARTIALLY_DELIVERED: 'Μερική',
  DELIVERED: 'Παραδομένη',
  INVOICED: 'Τιμολογημένη',
  CANCELLED: 'Ακυρωμένη',
};

const PILL_CLASS: Record<OrderStatus, string> = {
  PENDING: 'status-pending',
  PREPARING: 'status-preparing',
  READY: 'status-ready',
  PARTIALLY_DELIVERED: 'status-partial',
  DELIVERED: 'status-delivered',
  INVOICED: 'status-invoiced',
  CANCELLED: 'status-cancelled',
};

interface Props {
  status: OrderStatus;
  className?: string;
}

/**
 * Status pill with a semantic color and a leading colored dot.
 * Background is a 10% tint of the status color; the dot inherits currentColor.
 * Spec from the design package — each status owns its own hue, all dotted.
 */
export default function StatusBadge({ status, className }: Props) {
  const cls = `status-pill ${PILL_CLASS[status]} ${className ?? ''}`.trim();
  return <span className={cls}>{LABELS[status]}</span>;
}

export { LABELS as STATUS_LABELS };

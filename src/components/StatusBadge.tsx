import { cn } from '@/lib/cn';
import type { OrderStatus } from '@/types';

const LABELS: Record<OrderStatus, string> = {
  PENDING: 'Εκκρεμής',
  PREPARING: 'Σε ετοιμασία',
  READY: 'Έτοιμη',
  PARTIALLY_DELIVERED: 'Μερική παράδοση',
  DELIVERED: 'Παραδομένη',
  INVOICED: 'Τιμολογημένη',
  CANCELLED: 'Ακυρωμένη',
};

const STYLES: Record<OrderStatus, string> = {
  PENDING: 'bg-orange-100 text-orange-800',
  PREPARING: 'bg-blue-100 text-blue-800',
  READY: 'bg-purple-100 text-purple-800',
  PARTIALLY_DELIVERED: 'bg-yellow-100 text-yellow-800',
  DELIVERED: 'bg-green-100 text-green-800',
  INVOICED: 'bg-gray-100 text-gray-700',
  CANCELLED: 'bg-red-100 text-red-800',
};

interface Props {
  status: OrderStatus;
  className?: string;
}

export default function StatusBadge({ status, className }: Props) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
        STYLES[status],
        className,
      )}
    >
      {LABELS[status]}
    </span>
  );
}

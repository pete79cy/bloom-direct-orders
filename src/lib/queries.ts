import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './api';
import type {
  Customer,
  Order,
  OrderDetail,
  Plant,
  Variant,
  CustomerPrice,
  OrderStatus,
  Supplier,
  SupplierProduct,
  SupplierPrice,
} from '@/types';

const TEN_MIN = 10 * 60 * 1000;

export function useOrders() {
  return useQuery({
    queryKey: ['orders'],
    queryFn: () => apiFetch<Order[]>('/api/orders'),
  });
}

export function useOrder(id: string | undefined) {
  return useQuery({
    queryKey: ['order', id],
    enabled: !!id,
    queryFn: () => apiFetch<OrderDetail>(`/api/orders/${id}`),
  });
}

export function useCustomers() {
  return useQuery({
    queryKey: ['customers'],
    staleTime: TEN_MIN,
    queryFn: () => apiFetch<Customer[]>('/api/customers'),
  });
}

export function useVariants() {
  // status=all → include 'draft' rows so they surface in the PWA plant search
  // (rendered with a ΠΡΟΧΕΙΡΟ badge in VariantCard). Active-only would hide
  // drafts until the desktop admin promotes them — defeating in-session reuse.
  return useQuery({
    queryKey: ['variants'],
    staleTime: TEN_MIN,
    queryFn: () => apiFetch<Variant[]>('/api/variants?status=all'),
  });
}

export function usePlants() {
  // See useVariants — same rationale for ?status=all.
  return useQuery({
    queryKey: ['plants'],
    staleTime: TEN_MIN,
    queryFn: () => apiFetch<Plant[]>('/api/plants?status=all'),
  });
}

export interface CreateCustomerPayload {
  trading_name: string;
  legal_name?: string;
  vat_id?: string;
  country?: string;
  payment_terms_days?: number;
  notes?: string;
}

export function useCreateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateCustomerPayload) =>
      apiFetch<Customer>('/api/customers', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: (created) => {
      // Optimistically append to the list so the wizard can pick it up
      // immediately without waiting for a refetch.
      qc.setQueryData<Customer[]>(['customers'], (prev) =>
        prev ? [created, ...prev] : [created],
      );
      qc.invalidateQueries({ queryKey: ['customers'] });
    },
  });
}

export function useSuppliers() {
  return useQuery({
    queryKey: ['suppliers'],
    staleTime: TEN_MIN,
    queryFn: () => apiFetch<Supplier[]>('/api/suppliers'),
  });
}

export function useSupplierProducts() {
  return useQuery({
    queryKey: ['supplier-products'],
    staleTime: TEN_MIN,
    queryFn: () => apiFetch<SupplierProduct[]>('/api/supplier-products'),
  });
}

export function useSupplierPrices() {
  return useQuery({
    queryKey: ['supplier-prices'],
    staleTime: TEN_MIN,
    queryFn: () => apiFetch<SupplierPrice[]>('/api/supplier-prices'),
  });
}

/**
 * Fetches ALL customer-specific prices for a customer once.
 * Per the backend audit, /api/customer-prices is filtered only by customer_id;
 * the PWA filters by variant_id client-side via the returned array.
 */
export function useCustomerPrices(customerId: string | undefined) {
  return useQuery({
    queryKey: ['customer-prices', customerId],
    enabled: !!customerId,
    staleTime: TEN_MIN,
    queryFn: () =>
      apiFetch<CustomerPrice[]>(
        `/api/customer-prices?customer_id=${encodeURIComponent(customerId!)}`,
      ),
  });
}

/** Common shape for every direct-order line. Each line ALSO carries either
 *  a `variant_id` (existing catalogue row) or a `draft: {name, size?}`
 *  (free-text line for a plant not in the catalogue — server creates
 *  plants+variants rows with status='draft' on the fly). Exactly one of
 *  the two must be present per line; the server enforces this with 400. */
interface DirectOrderLineCommon {
  qty: number;
  unit_price: number;
  description?: string | null;
  discount_pct?: number | null;
  vat_rate?: number | null;
  line_no?: number;
}

export type DirectOrderLinePayload =
  | (DirectOrderLineCommon & { variant_id: string; draft?: undefined })
  | (DirectOrderLineCommon & { variant_id?: undefined; draft: { name: string; size?: string } });

export interface DirectOrderHeaderPayload {
  customer_id: string;
  delivery_date?: string | null;
  notes?: string | null;
  status?: OrderStatus;
}

export interface CreateDirectOrderPayload {
  order: DirectOrderHeaderPayload;
  lines: DirectOrderLinePayload[];
}

export interface CreateDirectOrderResponse {
  ok: true;
  orderId: string;
  orderNumber: string;
}

export function useCreateDirectOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateDirectOrderPayload) =>
      apiFetch<CreateDirectOrderResponse>('/api/direct-orders', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      // If the order contained any draft lines, the catalogue has new rows
      // the rep may want to reuse later in the same session. Invalidate
      // plants/variants too — the cost is negligible because both queries
      // have a 10-min staleTime and refetch only on next access.
      qc.invalidateQueries({ queryKey: ['plants'] });
      qc.invalidateQueries({ queryKey: ['variants'] });
    },
  });
}

export interface PatchOrderPayload {
  id: string;
  status?: OrderStatus;
  notes?: string | null;
  delivery_date?: string | null;
}

export function usePatchOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: PatchOrderPayload) =>
      apiFetch<Order>(`/api/orders/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['order', updated.id] });
    },
  });
}

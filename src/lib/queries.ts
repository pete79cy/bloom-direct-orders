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
  return useQuery({
    queryKey: ['variants'],
    staleTime: TEN_MIN,
    queryFn: () => apiFetch<Variant[]>('/api/variants'),
  });
}

export function usePlants() {
  return useQuery({
    queryKey: ['plants'],
    staleTime: TEN_MIN,
    queryFn: () => apiFetch<Plant[]>('/api/plants'),
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

export interface DirectOrderLinePayload {
  variant_id: string;
  qty: number;
  unit_price: number;
  description?: string | null;
  discount_pct?: number | null;
  vat_rate?: number | null;
  line_no?: number;
}

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

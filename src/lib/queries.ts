import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './api';
import type { NotifyChannel } from './notify-message';
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

// ── Supplier breakdown for a single order ──────────────────────────────────
// Shape mirrors what bloom-crm's GET /api/orders/:id/supplier-orders returns:
// lines grouped by supplier, with a final 'own-production' bucket (supplier=null).
// We re-declare the shape here rather than importing from bloom-crm — the two
// repos are kept independent on purpose, and the contract is small + stable.
export interface SupplierBreakdownLine {
  line_no: number;
  variant_id: string | null;
  variant_code: string;
  plant_common_name: string;
  plant_scientific_name: string;
  description: string;
  size_summary: string;
  qty: number;
  supplier_cost_price: number | null;
}
export interface SupplierBreakdownGroup {
  supplier: {
    id: string;
    name: string;
    contact_name?: string | null;
    email?: string | null;
    phone?: string | null;
    country?: string | null;
    notes?: string | null;
  } | null;
  lines: SupplierBreakdownLine[];
}
export interface SupplierBreakdownResponse {
  order: { id: string; order_number: string; delivery_date: string | null; notes: string | null; created_at: string };
  customer: { id: string; trading_name: string | null; legal_name: string | null } | null;
  groups: SupplierBreakdownGroup[];
}

// ── Deliveries for a date range (calendar source) ──────────────────────────
// Union of orders.delivery_date and delivery_notes.delivery_date so the
// PWA calendar surfaces BOTH planned-order dates and per-DN rescheduled
// or partial-delivery dates. One row per (date, order) tuple — the
// server collapses duplicates and marks them as source='both'. See
// GET /api/deliveries on the bloom-crm side for the contract.
export interface DeliveryRow {
  date: string;                 // YYYY-MM-DD
  source: 'order' | 'dn' | 'both';
  order_id: string;
  order_number: string;
  customer_id: string;
  customer_name: string;
  status: OrderStatus;
  dn_id: string | null;
  dn_number: string | null;
}

export function useDeliveries(from: string | undefined, to: string | undefined) {
  return useQuery({
    queryKey: ['deliveries', from, to],
    enabled: !!from && !!to,
    queryFn: () =>
      apiFetch<DeliveryRow[]>(
        `/api/deliveries?from=${encodeURIComponent(from!)}&to=${encodeURIComponent(to!)}`,
      ),
  });
}

// ── Order amendments (inline edit on PWA) ──────────────────────────────────
// Mirrors POST /api/orders/:orderId/amendments on bloom-crm. The PWA only
// uses confirm: true (apply immediately, no DRAFT state) — operators want
// the order to reflect their edit the second they tap Save, not stage it
// for the desktop to confirm. Reason categories and per-amendment notes
// are deliberately omitted on the PWA side; the desktop still has them
// when manual corrections are needed.
export type AmendmentType = 'ADD' | 'REMOVE' | 'QTY_CHANGE' | 'PRICE_CHANGE' | 'SUBSTITUTE';

export interface AmendmentRequest {
  type: AmendmentType;
  target_order_line_id?: string | null;
  new_variant_id?: string | null;
  new_qty?: number | null;
  new_unit_price?: number | null;
  reason_category?: string;
  reason_notes?: string;
  requested_by_party?: 'CUSTOMER' | 'NURSERY';
  requested_by_user?: string;
  confirm?: boolean;
}

export function useCreateAmendment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ orderId, amendment }: { orderId: string; amendment: AmendmentRequest }) => {
      return apiFetch<{ ok: boolean; id: string; amendment_no: number }>(
        `/api/orders/${orderId}/amendments`,
        {
          method: 'POST',
          body: JSON.stringify({ confirm: true, ...amendment }),
        },
      );
    },
    onSuccess: (_data, { orderId }) => {
      // Force a fresh read — order_lines were mutated server-side by the
      // applyAmendmentToOrder transaction inside the POST handler.
      void qc.invalidateQueries({ queryKey: ['order', orderId] });
      void qc.invalidateQueries({ queryKey: ['orders'] });
      void qc.invalidateQueries({ queryKey: ['deliveries'] });
    },
  });
}

// ── Google Contacts (add-customer-from-contact picker) ─────────────────────
// Backed by GET /api/google-contacts on bloom-crm (People API). The PWA
// fetches the full list once and filters client-side. The endpoint returns
// 409 { error: 'not_connected' | 'scope_missing' } when Google isn't linked
// or the contacts permission wasn't granted — surfaced via the query error
// (ApiError.payload.error) so the picker can show a connect/re-authorize hint.
export interface GoogleContact {
  name: string;
  phone: string;
  email: string;
}

export function useGoogleContacts(enabled: boolean) {
  return useQuery({
    queryKey: ['google-contacts'],
    enabled,
    staleTime: 5 * 60 * 1000,
    retry: false,
    queryFn: () => apiFetch<GoogleContact[]>('/api/google-contacts'),
  });
}

export function useNotifyCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ orderId, channel }: { orderId: string; channel: NotifyChannel }) => {
      return apiFetch<Order>(`/api/orders/${orderId}/notify`, {
        method: 'POST',
        body: JSON.stringify({ channel }),
      });
    },
    onSuccess: (_data, { orderId }) => {
      void qc.invalidateQueries({ queryKey: ['order', orderId] });
      void qc.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}

export function useOrderSupplierBreakdown(id: string | undefined, enabled: boolean = true) {
  return useQuery({
    queryKey: ['order-supplier-breakdown', id],
    // Only hit the endpoint when the overlay is open. The data shape is
    // bigger than /api/orders/:id (joins suppliers, supplier_products,
    // supplier_prices) — no point paying that cost on every order open.
    enabled: !!id && enabled,
    queryFn: () => apiFetch<SupplierBreakdownResponse>(`/api/orders/${id}/supplier-orders`),
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
  phone?: string;
  email?: string;
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

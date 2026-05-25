export type OrderStatus =
  | 'PENDING'
  | 'PREPARING'
  | 'READY'
  | 'PARTIALLY_DELIVERED'
  | 'DELIVERED'
  | 'INVOICED'
  | 'CANCELLED';

export interface Order {
  id: string;
  order_number: string;
  customer_id: string;
  status: OrderStatus;
  delivery_date: string | null;
  delivery_address_id: string | null;
  notes: string | null;
  source_quote_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrderLine {
  id: string;
  order_id: string;
  line_no: number;
  variant_id: string;
  description: string | null;
  qty: number;
  unit_price: number;
  discount_pct: number | null;
  vat_rate: number | null;
}

export interface Customer {
  id: string;
  legal_name: string;
  trading_name: string | null;
  email: string | null;
  phone: string | null;
  country: string | null;
}

export interface Plant {
  id: string;
  scientific_name: string;
  common_name: string | null;
}

export interface Variant {
  id: string;
  plant_id: string;
  variant_code: string;
  size_summary: string | null;
  default_sell_price: number | null;
  // Structural — used to build readable size meta on the client.
  // Nullable to tolerate older rows; renderer skips missing pieces.
  pot_volume_l?: number | null;
  height_min_cm?: number | null;
  height_max_cm?: number | null;
  girth_min_cm?: number | null;
  girth_max_cm?: number | null;
  pcs_per_pot?: number | null;
  plant_type?: string | null;
  form?: string | null;
  grade?: string | null;
}

export interface Supplier {
  id: string;
  name: string;
  trading_name?: string | null;
  country?: string | null;
}

export interface SupplierProduct {
  id: string;
  supplier_id: string;
  variant_id: string;
  supplier_sku: string;
  supplier_name_text: string;
  match_confidence: number;
}

export interface SupplierPrice {
  id: string;
  supplier_product_id: string;
  cost_price: number;
  currency: string;
  valid_from: string;
  valid_to: string | null;
  min_qty: number;
  lead_time_days: number;
  source: string;
  captured_at: string;
}

// Joined/enriched line as returned by GET /api/orders/:id
export interface OrderLineEnriched extends OrderLine {
  plant_common_name: string | null;
  plant_scientific_name: string | null;
  size_summary: string | null;
}

// Rich response from GET /api/orders/:id
export interface OrderDetail {
  order: Order;
  lines: OrderLineEnriched[];
  customer: Customer | null;
  sourceQuote: { id: string; quote_number: string } | null;
  deliveryNotes: unknown[];
  deliverySummary: unknown;
  amendments: unknown[];
  proformaInvoices: unknown[];
}

// Row returned by GET /api/customer-prices?customer_id=X
export interface CustomerPrice {
  variant_id: string;
  effective_unit_price: number;
  base_unit_price: number | null;
  discount_pct: number | null;
  currency: string;
  display_name: string;
  size_summary: string | null;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  role?: string;
}

export interface LoginResponse {
  token: string;
  user: AuthUser;
}

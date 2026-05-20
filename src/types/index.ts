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

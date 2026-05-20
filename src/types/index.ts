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
  issue_date: string;          // ISO date
  delivery_date: string | null;
  reference: string | null;
  notes: string | null;
  source_quote_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrderLine {
  id: string;
  order_id: string;
  variant_id: string;
  qty: number;
  unit_sell_price: number;
  notes: string | null;
  sort_order: number;
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

// Rich response from GET /api/orders/:id (confirmed by backend audit).
export interface OrderDetail {
  order: Order;
  lines: (OrderLine & { description?: string; size_summary?: string; plant_common_name?: string; plant_scientific_name?: string })[];
  customer: Customer | null;
  sourceQuote: { id: string; quote_number: string } | null;
  deliveryNotes: unknown[];
  deliverySummary: unknown;
  amendments: unknown[];
  proformaInvoices: unknown[];
}

// Customer-specific price row from GET /api/customer-prices?customer_id=X
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

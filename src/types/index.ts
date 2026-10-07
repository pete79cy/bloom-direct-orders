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
  customer_notified_at?: string | null;
  customer_notified_channel?: 'VIBER' | 'WHATSAPP' | 'SMS' | null;
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
  /** REMOVE/SUBSTITUTE amendments soft-cancel lines instead of deleting
   *  them; the API keeps returning them for the desktop audit view. */
  is_cancelled?: boolean;
}

export interface Customer {
  id: string;
  legal_name: string;
  trading_name: string | null;
  email: string | null;
  phone: string | null;
  country: string | null;
}

/** Catalogue review states. Set per-row by bloom-crm.
 *  - 'active'   normal catalogue row (default)
 *  - 'draft'    auto-created by the PWA free-text-line flow; pending admin review
 *  - 'archived' admin-rejected (kept for audit) */
export type CatalogueStatus = 'active' | 'draft' | 'archived';

export interface Plant {
  id: string;
  scientific_name: string;
  common_name: string | null;
  /** Optional for backward-compatibility with cached payloads pre-dating
   *  the status migration. Defaults to 'active' at the server. */
  status?: CatalogueStatus;
  /** 'plant' | 'pot' | 'other'; older cached rows may lack it (= plant). */
  product_kind?: 'plant' | 'pot' | 'other' | null;
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
  /** See Plant.status. */
  status?: CatalogueStatus;
  /** Plant's saved default VAT %, denormalized from the parent plant by the API. */
  default_vat_rate?: number;
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
  /** Status of the joined variant. 'draft' triggers the ΠΡΟΧΕΙΡΟ badge on
   *  the order detail line. Optional + nullable for resilience against
   *  older orders cached before the enrichment shipped. */
  variant_status?: CatalogueStatus | null;
  plant_status?: CatalogueStatus | null;
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

// ── Quotes (προσφορές) ─────────────────────────────────────────────────────
// Mirrors bloom-crm's `quotes` / `quote_lines` tables. The PWA writes quotes
// through the SAME endpoint the desktop uses (POST /api/quotes/save), so all
// Bloom rules apply: spec freeze on send, unpriced / group-price guards,
// customer + group pricelist write-back, own-cost stamping, accept → order.
// Column-name gotchas vs orders: unit_sell_price (not unit_price),
// description_override (not description), offered_variant_id (not variant_id).

export type QuoteStatus =
  | 'DRAFT'
  | 'SENT'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'EXPIRED'
  | 'CONVERTED'
  | 'SUPERSEDED';

export interface Quote {
  id: string;
  quote_number: string;
  customer_id: string;
  status: QuoteStatus;
  currency: string;
  /** YYYY-MM-DD from GET /api/quotes/:id; a full ISO timestamp from the list
   *  endpoint (node-pg Date). Always read through localDayKey(). */
  issue_date: string;
  valid_until: string;
  notes: string;
  terms: string;
  revision_of_quote_id: string | null;
  revision_no: number;
  created_at: string;
  updated_at: string;
  archived_at?: string | null;
  // List-endpoint aggregates.
  lines_count?: number;
  total_value?: number;
  needs_matching?: boolean;
  linked_order_id?: string | null;
}

/** Read-only display block added by GET /api/quotes/:id. Never persisted —
 *  the server ignores it when the line is round-tripped into a save. */
export interface QuoteLineDisplay {
  plant_common_name: string | null;
  plant_scientific_name: string | null;
  /** Set only on unmatched (free-text) lines. */
  free_text: string | null;
  size_summary: string | null;
  variant_code: string | null;
  variant_status: CatalogueStatus | null;
  plant_status: CatalogueStatus | null;
}

export type PriceScope = 'group' | 'customer' | 'quote';

/** A quote_lines row. The server returns ~50 columns (overrides, sourcing,
 *  audit); the PWA types only what it reads and round-trips the rest
 *  verbatim, so the index signature keeps them on the object. */
export interface QuoteLine {
  id: string;
  quote_id: string;
  line_no: number;
  offered_variant_id: string | null;
  is_alternative?: boolean;
  qty: number;
  unit_sell_price: number;
  discount_pct: number;
  vat_rate: number;
  description_override: string;
  offered_common_name_override?: string;
  requested_spec_text?: string;
  price_scope?: PriceScope | null;
  display?: QuoteLineDisplay;
  [column: string]: unknown;
}

export interface QuoteStatusHistoryRow {
  id: string;
  quote_id: string;
  from_status: QuoteStatus | null;
  to_status: QuoteStatus;
  changed_at: string;
  changed_by: string;
  action: string;
}

export interface QuoteDetail {
  quote: Quote;
  lines: QuoteLine[];
  /** `language` ('EL' | 'EN' | …) picks the default PDF language, as on desktop. */
  customer: (Customer & { phone?: string; email?: string; language?: string }) | null;
  statusHistory: QuoteStatusHistoryRow[];
  linkedOrder: { id: string; order_number: string; status: OrderStatus } | null;
  /** False when the desktop has created a newer revision — read-only here. */
  isLatestRevision: boolean;
}

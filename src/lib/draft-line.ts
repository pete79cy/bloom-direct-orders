/**
 * Helpers for the in-memory DraftLine that the New Order wizard carries.
 *
 * A DraftLine is one row in the wizard's local cart. It either:
 *  - references an existing catalogue variant via `variant_id`, OR
 *  - carries a `draft: {name, size}` payload — a "free-text" line for a
 *    plant the rep was asked for over the phone that isn't catalogued
 *    yet. The server creates plants+variants rows with status='draft'
 *    during the same transaction that places the order.
 *
 * The XOR is enforced at submit time by `draftLineToPayload`: exactly
 * one of (variant_id, draft) is sent to /api/direct-orders. The server
 * rejects any line that breaks the XOR with HTTP 400.
 *
 * Lives in its own module so NewOrderWizard.tsx (1000+ lines) stays
 * UI-focused.
 */

import type { VatRate } from './vat';

export type PriceSource = 'customer' | 'default' | 'override';

export interface DraftLineDraft {
  name: string;
  size: string;
}

export interface DraftLine {
  /** Identity for React keys + update/remove operations. For catalogue
   *  lines this IS the variant_id. For free-text lines it's a local
   *  placeholder `draft-<ts>-<i>` — the server generates the real
   *  variant_id during submit. */
  variant_id: string;
  qty: number;
  unit_price: number;
  price_source: PriceSource;
  vat_rate: VatRate;
  /** Per-line note ("χωρίς γλάστρα", "ύψος 80cm+"). Maps to
   *  order_lines.description. Empty string when none. */
  description: string;
  /** Present only when this is a free-text line. */
  draft?: DraftLineDraft;
}

/** True when the line is awaiting server-side draft creation (i.e. the
 *  variant_id is a local placeholder, not a real catalogue id). */
export function isDraftDraftLine(line: DraftLine): boolean {
  return !!line.draft;
}

/** Generate a unique local id for a new free-text line. The `i`
 *  argument disambiguates multiple drafts created in the same tick
 *  (e.g. two free-text lines in a single batched setLines call). */
export function makeLocalDraftId(i: number): string {
  return `draft-${Date.now()}-${i}`;
}

/** Wire payload for one direct-order line. Exactly one of variant_id
 *  and draft is set. */
export type DirectOrderLineWire =
  | {
      variant_id: string;
      qty: number;
      unit_price: number;
      vat_rate: number;
      line_no: number;
      description: string | null;
    }
  | {
      draft: { name: string; size: string };
      qty: number;
      unit_price: number;
      vat_rate: number;
      line_no: number;
      description: string | null;
    };

/** Map an in-memory DraftLine to the wire payload for
 *  POST /api/direct-orders. Free-text lines emit `draft: {name, size}`
 *  and OMIT variant_id; catalogue lines emit `variant_id` and OMIT
 *  draft. Empty description becomes null. */
export function draftLineToPayload(line: DraftLine, index: number): DirectOrderLineWire {
  const description = line.description ? line.description : null;
  if (line.draft) {
    return {
      draft: { name: line.draft.name, size: line.draft.size },
      qty: line.qty,
      unit_price: line.unit_price,
      vat_rate: line.vat_rate,
      line_no: index + 1,
      description,
    };
  }
  return {
    variant_id: line.variant_id,
    qty: line.qty,
    unit_price: line.unit_price,
    vat_rate: line.vat_rate,
    line_no: index + 1,
    description,
  };
}

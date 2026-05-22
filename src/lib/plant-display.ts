/**
 * Plant data display helpers — sanitize the often-messy variant data
 * coming from bloom-crm so the UI never shows literal "null" or raw
 * machine codes.
 *
 * The bloom-crm backend can emit:
 *   - variant_code like "LANTANA-MONTEVIDENSIS__OTHER__BUSH__PnullL__H2-5"
 *     (these are MACHINE identifiers — never show to humans)
 *   - size_summary like "P5L · H20-50" or sometimes "PnullL · H2-5"
 *     when the underlying pot_volume_l/height fields are null
 *   - scientific_name like "Lantana montevidensis" (good) or
 *     "LANTANA-MONTEVIDENSIS" (bad, machine-cased)
 *
 * These helpers normalise everything for display.
 */

/**
 * Convert ALL-CAPS-WITH-HYPHENS-OR-UNDERSCORES into Title Case With Spaces.
 * Leaves already-correctly-cased names alone.
 *
 * Examples:
 *   "LANTANA-MONTEVIDENSIS"   → "Lantana montevidensis"
 *   "Lantana montevidensis"   → "Lantana montevidensis"
 *   "Olea europaea 'Frantoio'" → "Olea europaea 'Frantoio'"
 */
export function prettyScientificName(raw: string | null | undefined): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  // If the string is all uppercase + hyphens/underscores, it's machine format.
  const looksMachine = /^[A-Z0-9_\-\s]+$/.test(trimmed) && trimmed === trimmed.toUpperCase();
  if (!looksMachine) return trimmed;
  return trimmed
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((word, i) => (i === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(' ');
}

/**
 * Scrub a `size_summary` string of "null" tokens that leak in when the
 * upstream template literal interpolates null values. Returns null if
 * the result would be empty or meaningless.
 *
 * Examples:
 *   "P5L · H20-50"      → "P5L · H20-50"
 *   "PnullL · H2-5"     → "H2-5"
 *   "PnullL · Hnull-5"  → null
 *   "P5L"               → "P5L"
 *   null                → null
 */
export function cleanSizeSummary(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw
    .split(/\s*·\s*|\s*•\s*|\s*,\s*/)
    .map((token) => token.trim())
    // Drop tokens that contain "null" anywhere (P-null-L, Hnull-5, etc.)
    .filter((token) => token.length > 0 && !/null/i.test(token))
    .join(' · ');
  return cleaned.length > 0 ? cleaned : null;
}

/**
 * Best-effort short label for a variant when neither scientific name nor
 * size summary is available — pulls the first human-readable token from
 * the machine-format variant_code.
 *
 * Example: "LANTANA-MONTEVIDENSIS__OTHER__BUSH__PnullL"
 *       → "Lantana montevidensis"
 */
export function fallbackVariantLabel(variantCode: string | null | undefined): string {
  if (!variantCode) return 'Παραλλαγή';
  const [firstToken] = variantCode.split('__');
  return prettyScientificName(firstToken) || 'Παραλλαγή';
}

/**
 * Two-line plant name resolution.
 *
 * The card hierarchy puts the Greek common name first (it's what the user
 * reads), with the scientific Latin name as a smaller secondary line. If
 * no common name exists, the scientific name is promoted to primary and
 * the secondary line is suppressed.
 */
export function pickPlantName(plant: {
  scientific_name?: string | null;
  common_name?: string | null;
} | null | undefined): { primary: string; secondary: string | null } {
  const common = plant?.common_name?.trim() || '';
  const scientific = prettyScientificName(plant?.scientific_name) || '';
  if (common && scientific && common !== scientific) {
    return { primary: common, secondary: scientific };
  }
  if (common) return { primary: common, secondary: null };
  if (scientific) return { primary: scientific, secondary: null };
  return { primary: 'Φυτό', secondary: null };
}

/* ── Size meta builder ──────────────────────────────────────
   Build a list of structured tokens from variant fields:
     Pot:    "P 5L"
     Height: "H 20–50 CM"
     Girth:  "G 8–10 CM"
   Skip any piece whose data is missing OR whose min/max are both 1 —
   bloom-crm stores 1↔1 as the "we don't actually know" placeholder for
   variants that were imported without dimensions.
   ──────────────────────────────────────────────────────────── */

interface VariantSizeFields {
  pot_volume_l?: number | null;
  height_min_cm?: number | null;
  height_max_cm?: number | null;
  girth_min_cm?: number | null;
  girth_max_cm?: number | null;
}

function isPlaceholder(min: number | null | undefined, max: number | null | undefined): boolean {
  // bloom-crm convention: "unknown" rows save as 1/1
  return min === 1 && max === 1;
}

function fmtRange(prefix: string, min: number, max: number, unit: string): string {
  return min === max ? `${prefix} ${min} ${unit}` : `${prefix} ${min}–${max} ${unit}`;
}

export function sizeDetails(v: VariantSizeFields): string[] {
  const out: string[] = [];

  if (v.pot_volume_l != null && v.pot_volume_l > 0) {
    // Drop trailing .0 ("5L" not "5.0L")
    const litres = Number.isInteger(v.pot_volume_l) ? v.pot_volume_l : Number(v.pot_volume_l).toFixed(1);
    out.push(`P ${litres}L`);
  }

  if (v.height_min_cm != null && v.height_max_cm != null && !isPlaceholder(v.height_min_cm, v.height_max_cm)) {
    out.push(fmtRange('H', v.height_min_cm, v.height_max_cm, 'CM'));
  }

  if (v.girth_min_cm != null && v.girth_max_cm != null && !isPlaceholder(v.girth_min_cm, v.girth_max_cm)) {
    out.push(fmtRange('G', v.girth_min_cm, v.girth_max_cm, 'CM'));
  }

  return out;
}

/**
 * Convenience: join sizeDetails() with the design-package's "·" separator.
 * Returns null when the variant has no structural data at all (so the
 * renderer can skip the size line entirely).
 */
export function sizeDetailsString(v: VariantSizeFields): string | null {
  const parts = sizeDetails(v);
  return parts.length > 0 ? parts.join(' · ') : null;
}

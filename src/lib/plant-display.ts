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

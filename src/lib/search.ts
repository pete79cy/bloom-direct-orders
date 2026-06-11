/**
 * Diacritic-insensitive lowercase normalisation for free-text search.
 *
 * Operators in the field type on the iPhone glass keyboard where typing
 * tonos / dialytika is a deliberate extra step (long-press the vowel,
 * pick the accented variant). Plain `toLowerCase().includes(query)`
 * search forced the user to either get the accents perfectly right
 * or scroll the unfiltered list — both wasted seconds per lookup.
 *
 * `String.prototype.normalize('NFD')` decomposes accented characters
 * into a base letter + combining mark (e.g. "ά" → "α" + U+0301). The
 * regex then strips every codepoint in the Unicode "Combining
 * Diacritical Marks" block (U+0300..U+036F), leaving the base letters.
 *
 * Effect:
 *   - "Λεβάντα" → "λεβαντα"
 *   - "Λεβαντα" → "λεβαντα"
 *   - the search term matches both spellings.
 *
 * Greek-specific note: final sigma "ς" lower-cases to "ς" (NOT "σ").
 * That's already the correct behaviour for matching because the
 * catalogue stores "ς" as "ς" too. No special handling needed.
 *
 * The function is null/undefined-safe so calling code stays terse.
 *
 * Use ONLY for search matching. Do NOT use this to display anything —
 * stripped strings are not the same string the user typed or the
 * catalogue stored.
 */
export function normalizeForSearch(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

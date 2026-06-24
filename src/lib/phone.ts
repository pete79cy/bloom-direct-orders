/**
 * Normalises a stored phone string to an international E.164-ish form for
 * deep-link messaging (Viber / WhatsApp / SMS).
 *
 * Cyprus numbers are stored inconsistently ("99123456", "+357 99 123456",
 * "00357..."). The sheet that uses this ALWAYS shows the resolved number so
 * the operator verifies the recipient before sending — we never silently
 * send to an ambiguous number, hence the "surface, don't guess" fallback.
 *
 * Rules:
 *   - strip all non-digits
 *   - "00357…"  → "+357…"   (drop the international 00 prefix)
 *   - "357…"    → "+357…"
 *   - 8 digits starting 2 or 9 (CY landline / mobile) → "+357…"
 *   - "0049…" / other "00…" → "+…" (drop 00, keep country code as given)
 *   - anything else → "+<digits>"  (surface for verification)
 */
export function normalizeCyprusPhone(raw: string | null | undefined): string {
  if (!raw) return '';
  const digits = String(raw).replace(/\D/g, '');
  if (!digits) return '';

  if (digits.startsWith('00357')) return '+357' + digits.slice(5);
  if (digits.startsWith('357')) return '+' + digits;
  if (digits.length === 8 && /^[29]/.test(digits)) return '+357' + digits;
  if (digits.startsWith('00')) return '+' + digits.slice(2);
  return '+' + digits;
}

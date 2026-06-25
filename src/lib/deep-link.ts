/**
 * Read a query-string value from an iOS Shortcut deep link.
 *
 * Shortcuts often insert literal "%20" or "+" between name parts instead of
 * URL-encoding the whole value, which leaves "Παναγιώτης%20" in the field.
 * Decode repeatedly until stable so the form shows a normal name.
 */
export function readDeepLinkParam(
  params: URLSearchParams,
  key: string,
): string {
  const raw = params.get(key);
  if (!raw) return '';

  let value = raw.trim();
  for (let i = 0; i < 3; i++) {
    const next = tryDecodeURIComponent(value);
    if (next === value) break;
    value = next;
  }
  return value.replace(/\+/g, ' ').trim();
}

function tryDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function fmtEUR(amount: number | null | undefined): string {
  if (amount == null) return '—';
  return new Intl.NumberFormat('el-GR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 2,
  }).format(amount);
}

export function fmtShortDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('el-GR', { day: '2-digit', month: 'short' });
}

export function fmtLongDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('el-GR', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

export function addDays(iso: string, n: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Normalises a server-supplied date value to a YYYY-MM-DD string.
 *
 * Postgres DATE columns come back through node-pg as JS Date objects.
 * When bloom-crm's API serialises them with res.json() → JSON.stringify,
 * they emit a full ISO timestamp like "2026-06-02T00:00:00.000Z".
 *
 * That's fine for fmtShortDate / fmtLongDate (which Date-parse anything)
 * but breaks string-equality checks such as
 *   o.delivery_date === todayISO
 * — todayISO is "2026-06-02", the server value is "2026-06-02T00:00:00.000Z",
 * so the === always returns false and "Σήμερα: 0" sticks regardless of
 * how many orders are actually due today.
 *
 * Pass every server-supplied date through dayKey() before comparing it
 * to an isoToday()-style key. Handles null / undefined defensively.
 */
export function dayKey(value: string | null | undefined): string {
  if (!value) return '';
  return value.slice(0, 10);
}

/**
 * Calendar day (YYYY-MM-DD) of a server date value, in the DEVICE's local
 * time zone. Unlike dayKey() this is correct for node-pg `date` columns that
 * were JSON-serialised from a local-midnight Date on a UTC+3 server
 * ("2026-10-26T21:00:00.000Z" → "2026-10-27" on a Cyprus phone). Plain
 * YYYY-MM-DD input is returned unchanged.
 */
export function localDayKey(value: string | null | undefined): string {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value.slice(0, 10);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

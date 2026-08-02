/**
 * Device-local order reminders.
 *
 * Stored in localStorage so they work without bloom-crm schema changes.
 * They sync per-browser/device only — not across phones or desktop CRM.
 */

export interface OrderReminder {
  id: string;
  orderId: string;
  orderNumber: string;
  customerName: string;
  /** ISO datetime when the reminder should surface. */
  remindAt: string;
  body: string;
  createdAt: string;
  /** Set when the operator marks it done / dismisses a due reminder. */
  dismissedAt: string | null;
}

const STORAGE_KEY = 'bdo_reminders';
export const REMINDERS_CHANGED_EVENT = 'bdo-reminders-changed';

function emitChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(REMINDERS_CHANGED_EVENT));
  }
}

function readAll(): OrderReminder[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isReminder);
  } catch {
    return [];
  }
}

function writeAll(items: OrderReminder[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  emitChanged();
}

function isReminder(value: unknown): value is OrderReminder {
  if (!value || typeof value !== 'object') return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.id === 'string' &&
    typeof r.orderId === 'string' &&
    typeof r.orderNumber === 'string' &&
    typeof r.remindAt === 'string' &&
    typeof r.body === 'string' &&
    typeof r.createdAt === 'string'
  );
}

export function listReminders(): OrderReminder[] {
  return readAll().sort(
    (a, b) => new Date(a.remindAt).getTime() - new Date(b.remindAt).getTime(),
  );
}

/** Active (not dismissed) reminder for an order, if any. */
export function getActiveReminderForOrder(orderId: string): OrderReminder | null {
  return listReminders().find((r) => r.orderId === orderId && !r.dismissedAt) ?? null;
}

/** Reminders whose time has passed and are still open. */
export function getDueReminders(now = Date.now()): OrderReminder[] {
  return listReminders().filter(
    (r) => !r.dismissedAt && new Date(r.remindAt).getTime() <= now,
  );
}

/** Upcoming (not yet due) active reminders. */
export function getUpcomingReminders(now = Date.now()): OrderReminder[] {
  return listReminders().filter(
    (r) => !r.dismissedAt && new Date(r.remindAt).getTime() > now,
  );
}

export function upsertReminder(input: {
  orderId: string;
  orderNumber: string;
  customerName: string;
  remindAt: string;
  body: string;
}): OrderReminder {
  const all = readAll();
  const existingIdx = all.findIndex((r) => r.orderId === input.orderId && !r.dismissedAt);
  const nowIso = new Date().toISOString();

  if (existingIdx >= 0) {
    const updated: OrderReminder = {
      ...all[existingIdx],
      orderNumber: input.orderNumber,
      customerName: input.customerName,
      remindAt: input.remindAt,
      body: input.body.trim(),
      dismissedAt: null,
    };
    all[existingIdx] = updated;
    writeAll(all);
    return updated;
  }

  const created: OrderReminder = {
    id: `rem-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    orderId: input.orderId,
    orderNumber: input.orderNumber,
    customerName: input.customerName,
    remindAt: input.remindAt,
    body: input.body.trim(),
    createdAt: nowIso,
    dismissedAt: null,
  };
  all.push(created);
  writeAll(all);
  return created;
}

export function dismissReminder(id: string) {
  const all = readAll();
  const idx = all.findIndex((r) => r.id === id);
  if (idx < 0) return;
  all[idx] = { ...all[idx], dismissedAt: new Date().toISOString() };
  writeAll(all);
}

export function deleteReminder(id: string) {
  writeAll(readAll().filter((r) => r.id !== id));
}

export function deleteReminderForOrder(orderId: string) {
  writeAll(readAll().filter((r) => !(r.orderId === orderId && !r.dismissedAt)));
}

/** Local datetime string suitable for <input type="datetime-local">. */
export function toDatetimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Parse datetime-local value into an ISO string (local timezone). */
export function fromDatetimeLocalValue(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new Error('Μη έγκυρη ημερομηνία');
  return d.toISOString();
}

export function fmtReminderWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('el-GR', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

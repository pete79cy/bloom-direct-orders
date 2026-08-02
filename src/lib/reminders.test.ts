import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  deleteReminderForOrder,
  dismissReminder,
  fromDatetimeLocalValue,
  getActiveReminderForOrder,
  getDueReminders,
  listReminders,
  toDatetimeLocalValue,
  upsertReminder,
} from './reminders';

describe('reminders', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.useRealTimers();
  });

  it('upserts one active reminder per order', () => {
    const first = upsertReminder({
      orderId: 'o-1',
      orderNumber: 'ORD-2026-001',
      customerName: 'Μαρία',
      remindAt: new Date('2030-01-01T10:00:00').toISOString(),
      body: 'Κάλεσε',
    });
    const second = upsertReminder({
      orderId: 'o-1',
      orderNumber: 'ORD-2026-001',
      customerName: 'Μαρία',
      remindAt: new Date('2030-01-02T10:00:00').toISOString(),
      body: 'Επιβεβαίωση',
    });
    expect(second.id).toBe(first.id);
    expect(listReminders()).toHaveLength(1);
    expect(getActiveReminderForOrder('o-1')?.body).toBe('Επιβεβαίωση');
  });

  it('returns due reminders and dismisses them', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-02T12:00:00'));
    const r = upsertReminder({
      orderId: 'o-2',
      orderNumber: 'ORD-2026-002',
      customerName: 'Γιάννης',
      remindAt: new Date('2026-08-02T11:00:00').toISOString(),
      body: '',
    });
    expect(getDueReminders()).toHaveLength(1);
    dismissReminder(r.id);
    expect(getDueReminders()).toHaveLength(0);
    expect(getActiveReminderForOrder('o-2')).toBeNull();
  });

  it('deleteReminderForOrder removes the active one', () => {
    upsertReminder({
      orderId: 'o-3',
      orderNumber: 'ORD-2026-003',
      customerName: 'Άννα',
      remindAt: new Date('2030-01-01T10:00:00').toISOString(),
      body: 'x',
    });
    deleteReminderForOrder('o-3');
    expect(getActiveReminderForOrder('o-3')).toBeNull();
  });

  it('round-trips datetime-local values', () => {
    const d = new Date(2026, 7, 2, 15, 30);
    const local = toDatetimeLocalValue(d);
    expect(local).toBe('2026-08-02T15:30');
    const iso = fromDatetimeLocalValue(local);
    expect(new Date(iso).getTime()).toBe(d.getTime());
  });
});

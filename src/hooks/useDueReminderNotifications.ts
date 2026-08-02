import { useEffect } from 'react';
import {
  REMINDERS_CHANGED_EVENT,
  getDueReminders,
  type OrderReminder,
} from '@/lib/reminders';

const NOTIFIED_KEY = 'bdo_reminder_notified';

function readNotified(): Set<string> {
  try {
    const raw = sessionStorage.getItem(NOTIFIED_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    return Array.isArray(arr) ? new Set(arr.filter((x) => typeof x === 'string')) : new Set();
  } catch {
    return new Set();
  }
}

function writeNotified(ids: Set<string>) {
  sessionStorage.setItem(NOTIFIED_KEY, JSON.stringify([...ids]));
}

async function maybeNotify(due: OrderReminder[]) {
  if (due.length === 0 || typeof window === 'undefined') return;
  if (!('Notification' in window)) return;

  const notified = readNotified();
  const fresh = due.filter((r) => !notified.has(r.id));
  if (fresh.length === 0) return;

  if (Notification.permission === 'default') {
    try {
      await Notification.requestPermission();
    } catch {
      return;
    }
  }
  if (Notification.permission !== 'granted') return;

  for (const r of fresh) {
    const title = `Υπενθύμιση · ${r.orderNumber}`;
    const body = r.body?.trim()
      || (r.customerName ? r.customerName : 'Έχεις ανοιχτή υπενθύμιση παραγγελίας');
    try {
      new Notification(title, { body, tag: r.id });
      notified.add(r.id);
    } catch {
      // Ignore — some browsers block Notification ctor outside SW.
    }
  }
  writeNotified(notified);
}

/**
 * On mount (and whenever reminders change), surface due items via the
 * browser Notification API when permission allows. Due cards still show
 * on Home regardless.
 */
export function useDueReminderNotifications() {
  useEffect(() => {
    const run = () => {
      void maybeNotify(getDueReminders());
    };
    run();
    const interval = window.setInterval(run, 60_000);
    window.addEventListener(REMINDERS_CHANGED_EVENT, run);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener(REMINDERS_CHANGED_EVENT, run);
    };
  }, []);
}

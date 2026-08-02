import { useCallback, useEffect, useState } from 'react';
import {
  REMINDERS_CHANGED_EVENT,
  getDueReminders,
  getUpcomingReminders,
  listReminders,
  type OrderReminder,
} from '@/lib/reminders';

/** Reactive view of device-local reminders. Re-renders on storage changes. */
export function useReminders() {
  const [reminders, setReminders] = useState<OrderReminder[]>(() => listReminders());

  const refresh = useCallback(() => {
    setReminders(listReminders());
  }, []);

  useEffect(() => {
    refresh();
    const onChange = () => refresh();
    window.addEventListener(REMINDERS_CHANGED_EVENT, onChange);
    window.addEventListener('storage', onChange);
    return () => {
      window.removeEventListener(REMINDERS_CHANGED_EVENT, onChange);
      window.removeEventListener('storage', onChange);
    };
  }, [refresh]);

  const now = Date.now();
  const due = getDueReminders(now);
  const upcoming = getUpcomingReminders(now);

  return { reminders, due, upcoming, refresh };
}

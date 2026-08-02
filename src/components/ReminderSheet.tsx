import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import MobileSheet from './MobileSheet';
import {
  deleteReminderForOrder,
  fromDatetimeLocalValue,
  getActiveReminderForOrder,
  toDatetimeLocalValue,
  upsertReminder,
} from '@/lib/reminders';

interface Props {
  open: boolean;
  onClose: () => void;
  orderId: string;
  orderNumber: string;
  customerName: string;
}

function defaultRemindAt(): string {
  const d = new Date();
  d.setHours(d.getHours() + 2, 0, 0, 0);
  return toDatetimeLocalValue(d);
}

const PRESETS: { label: string; apply: () => string }[] = [
  {
    label: 'Σε 1 ώρα',
    apply: () => {
      const d = new Date();
      d.setHours(d.getHours() + 1, d.getMinutes(), 0, 0);
      return toDatetimeLocalValue(d);
    },
  },
  {
    label: 'Αύριο πρωί',
    apply: () => {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(9, 0, 0, 0);
      return toDatetimeLocalValue(d);
    },
  },
  {
    label: 'Αύριο απόγευμα',
    apply: () => {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(15, 0, 0, 0);
      return toDatetimeLocalValue(d);
    },
  },
];

export default function ReminderSheet({
  open,
  onClose,
  orderId,
  orderNumber,
  customerName,
}: Props) {
  const existing = getActiveReminderForOrder(orderId);
  const [when, setWhen] = useState(defaultRemindAt);
  const [body, setBody] = useState('');

  useEffect(() => {
    if (!open) return;
    const active = getActiveReminderForOrder(orderId);
    if (active) {
      setWhen(toDatetimeLocalValue(new Date(active.remindAt)));
      setBody(active.body);
    } else {
      setWhen(defaultRemindAt());
      setBody('');
    }
  }, [open, orderId]);

  function save() {
    try {
      if (!when) {
        toast.error('Διάλεξε ημερομηνία και ώρα');
        return;
      }
      const remindAt = fromDatetimeLocalValue(when);
      if (new Date(remindAt).getTime() < Date.now() - 60_000) {
        toast.error('Η υπενθύμιση πρέπει να είναι στο μέλλον');
        return;
      }
      upsertReminder({
        orderId,
        orderNumber,
        customerName,
        remindAt,
        body,
      });
      toast.success(existing ? 'Η υπενθύμιση ενημερώθηκε' : 'Η υπενθύμιση ορίστηκε');
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Σφάλμα');
    }
  }

  function remove() {
    deleteReminderForOrder(orderId);
    toast.success('Η υπενθύμιση διαγράφηκε');
    onClose();
  }

  return (
    <MobileSheet open={open} onClose={onClose} title="Υπενθύμιση">
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          minHeight: 0,
        }}
      >
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            padding: '4px 16px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          <p style={{ fontSize: 13, color: 'var(--ink-500)', margin: 0, lineHeight: 1.45 }}>
            Θα εμφανιστεί στην αρχική οθόνη όταν έρθει η ώρα (σε αυτή τη συσκευή).
          </p>

          <div>
            <label
              className="folio"
              style={{ display: 'block', marginBottom: 8 }}
            >
              <span>Πότε</span>
            </label>
            <input
              type="datetime-local"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              className="ios-tap"
              style={{
                width: '100%',
                height: 48,
                borderRadius: 12,
                border: '1px solid rgba(63,75,70,0.14)',
                background: '#fff',
                padding: '0 14px',
                fontSize: 16,
                color: 'var(--ink-900)',
              }}
            />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => setWhen(p.apply())}
                  className="ios-tap"
                  style={{
                    height: 34,
                    padding: '0 12px',
                    borderRadius: 999,
                    border: '1px solid rgba(63,75,70,0.12)',
                    background: 'var(--cream-100)',
                    fontSize: 13,
                    color: 'var(--sage-800)',
                    fontWeight: 500,
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label
              className="folio"
              style={{ display: 'block', marginBottom: 8 }}
            >
              <span>Σημείωση (προαιρετικά)</span>
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
              placeholder="π.χ. Να τηλεφωνήσω για επιβεβαίωση παράδοσης"
              style={{
                width: '100%',
                borderRadius: 12,
                border: '1px solid rgba(63,75,70,0.14)',
                background: '#fff',
                padding: '12px 14px',
                fontSize: 15,
                color: 'var(--ink-900)',
                resize: 'vertical',
                lineHeight: 1.45,
              }}
            />
          </div>
        </div>

        <div
          style={{
            padding: '12px 16px calc(12px + env(safe-area-inset-bottom, 0px))',
            borderTop: '1px solid rgba(63,75,70,0.08)',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <button
            type="button"
            onClick={save}
            className="btn-primary ios-tap"
            style={{ height: 50 }}
          >
            {existing ? 'Ενημέρωση' : 'Ορισμός υπενθύμισης'}
          </button>
          {existing && (
            <button
              type="button"
              onClick={remove}
              className="ios-tap"
              style={{
                height: 44,
                borderRadius: 12,
                border: 'none',
                background: 'transparent',
                color: 'var(--st-cancelled)',
                fontSize: 15,
                fontWeight: 500,
              }}
            >
              Διαγραφή υπενθύμισης
            </button>
          )}
        </div>
      </div>
    </MobileSheet>
  );
}

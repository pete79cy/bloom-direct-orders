import { useState } from 'react';
import { Check, Loader2, FileText, Tag, Image as ImageIcon } from 'lucide-react';
import MobileSheet from './MobileSheet';
import type { DeliveryPdfMode } from '@/lib/pdf-delivery';

interface Props {
  open: boolean;
  onClose: () => void;
  busy: boolean;
  onGenerate: (modes: DeliveryPdfMode[]) => void;
}

/**
 * Multi-select action sheet for delivery PDF generation.
 *
 *   [✓] Δελτίο αποστολής (χωρίς τιμές)
 *   [ ] Με τιμές
 *   [ ] Visual list (με φωτό)
 *   ─────────────────────────
 *   [    Λήψη / Κοινοποίηση PDF    ]
 *
 * One ticked = single-section PDF.
 * 2-3 ticked = multi-section PDF with page breaks between.
 * Defaults to "slip" pre-checked because it's the most common.
 */
export default function PdfActionSheet({ open, onClose, busy, onGenerate }: Props) {
  const [modes, setModes] = useState<Record<DeliveryPdfMode, boolean>>({
    slip: true,
    priced: false,
    visual: false,
  });

  function toggle(mode: DeliveryPdfMode) {
    setModes((prev) => ({ ...prev, [mode]: !prev[mode] }));
  }

  const selected = (Object.entries(modes) as [DeliveryPdfMode, boolean][])
    .filter(([, v]) => v)
    .map(([k]) => k);
  const canGenerate = selected.length > 0 && !busy;

  return (
    <MobileSheet open={open} onClose={onClose} title="Λήψη / Εκτύπωση">
      {/* Two-row flex layout: scrollable options + sticky commit bar.
          On short viewports (iOS with the bottom Safari toolbar visible)
          the submit button used to sit below the visible area; the user
          could check all three modes and never see the button to tap. The
          sticky bar guarantees the commit affordance is always reachable. */}
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
            padding: '8px 16px 12px',
          }}
        >
          <Option
            checked={modes.slip}
            onToggle={() => toggle('slip')}
            icon={<FileText size={18} color="var(--sage-700)" strokeWidth={1.5} />}
            title="Δελτίο αποστολής"
            subtitle="Χωρίς τιμές, με υπογραφές"
          />
          <Option
            checked={modes.priced}
            onToggle={() => toggle('priced')}
            icon={<Tag size={18} color="var(--sage-700)" strokeWidth={1.5} />}
            title="Με τιμές"
            subtitle="Πλήρες δελτίο παράδοσης με ΦΠΑ"
          />
          <Option
            checked={modes.visual}
            onToggle={() => toggle('visual')}
            icon={<ImageIcon size={18} color="var(--sage-700)" strokeWidth={1.5} />}
            title="Visual list"
            subtitle="Φωτογραφία ανά γραμμή για picker"
          />
        </div>

        <div
          className="pb-safe"
          style={{
            flexShrink: 0,
            padding: '12px 16px 14px',
            borderTop: '1px solid rgba(63,75,70,0.08)',
            background: 'var(--cream-50)',
          }}
        >
          <button
            type="button"
            disabled={!canGenerate}
            onClick={() => onGenerate(selected)}
            className="btn-primary ios-tap"
          >
            {busy ? (
              <>
                <Loader2 size={16} color="var(--cream-50)" className="animate-spin" />
                Δημιουργία…
              </>
            ) : selected.length === 1 ? (
              'Λήψη / Κοινοποίηση'
            ) : selected.length > 1 ? (
              `Λήψη συνδυασμένου PDF (${selected.length})`
            ) : (
              'Επίλεξε τουλάχιστον ένα'
            )}
          </button>
        </div>
      </div>
    </MobileSheet>
  );
}

interface OptionProps {
  checked: boolean;
  onToggle: () => void;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}

function Option({ checked, onToggle, icon, title, subtitle }: OptionProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="ios-tap"
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '14px 12px',
        background: checked ? 'var(--sage-50)' : '#fff',
        border: `1px solid ${checked ? 'rgba(63,107,92,0.25)' : 'rgba(63,75,70,0.08)'}`,
        borderRadius: 14,
        marginBottom: 8,
        textAlign: 'left',
        transition: 'background 160ms ease, border-color 160ms ease',
      }}
    >
      {/* Checkbox indicator */}
      <span
        style={{
          width: 22,
          height: 22,
          borderRadius: 6,
          background: checked ? 'var(--sage-700)' : '#fff',
          border: `1.5px solid ${checked ? 'var(--sage-700)' : 'rgba(63,75,70,0.20)'}`,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          transition: 'background 160ms ease, border-color 160ms ease',
        }}
      >
        {checked && <Check size={14} color="var(--cream-50)" strokeWidth={2.5} />}
      </span>

      <span style={{ flex: '0 0 auto' }}>{icon}</span>

      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 14, fontWeight: 500, color: 'var(--ink-900)' }}>
          {title}
        </span>
        <span style={{ display: 'block', fontSize: 11.5, color: 'var(--ink-500)', marginTop: 2 }}>
          {subtitle}
        </span>
      </span>
    </button>
  );
}

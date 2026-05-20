import { Minus, Plus } from 'lucide-react';

interface Props {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}

export default function QtyStepper({ value, onChange, min = 0, max }: Props) {
  const canDec = value > min;
  const canInc = max === undefined || value < max;
  return (
    <div className="inline-flex items-center bg-gray-100 rounded-full">
      <button
        type="button"
        aria-label="Μείωση"
        disabled={!canDec}
        onClick={() => canDec && onChange(value - 1)}
        className="w-9 h-9 flex items-center justify-center disabled:opacity-30"
      >
        <Minus className="w-4 h-4" />
      </button>
      <span className="min-w-10 text-center font-medium tabular-nums">{value}</span>
      <button
        type="button"
        aria-label="Αύξηση"
        disabled={!canInc}
        onClick={() => canInc && onChange(value + 1)}
        className="w-9 h-9 flex items-center justify-center disabled:opacity-30"
      >
        <Plus className="w-4 h-4" />
      </button>
    </div>
  );
}

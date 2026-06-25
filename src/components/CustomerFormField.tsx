/**
 * Single labelled text input used by the customer forms (NewCustomerSheet
 * and AddCustomerPage). Extracted from NewCustomerSheet so both entry
 * points share one field implementation.
 */
export interface CustomerFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  autoFocus?: boolean;
  inputMode?: 'text' | 'numeric' | 'decimal' | 'email' | 'tel';
}

export default function CustomerFormField({
  label,
  value,
  onChange,
  placeholder,
  required,
  autoFocus,
  inputMode = 'text',
}: CustomerFieldProps) {
  return (
    <label style={{ display: 'block', marginBottom: 16 }}>
      <span
        className="text-eyebrow"
        style={{ fontSize: 9, marginBottom: 6, display: 'block', color: 'var(--ink-500)' }}
      >
        {label}
        {required && <span style={{ color: 'var(--clay)', marginLeft: 4 }}>*</span>}
      </span>
      <input
        type="text"
        inputMode={inputMode}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        style={{
          width: '100%',
          height: 46,
          padding: '0 14px',
          background: '#fff',
          border: '1px solid rgba(63,75,70,0.12)',
          borderRadius: 12,
          fontSize: 16,
          outline: 'none',
          transition: 'border-color 160ms ease, box-shadow 160ms ease',
        }}
        onFocus={(e) => {
          e.target.style.borderColor = 'var(--sage-400)';
          e.target.style.boxShadow = '0 0 0 3px rgba(63,107,92,0.15)';
        }}
        onBlur={(e) => {
          e.target.style.borderColor = 'rgba(63,75,70,0.12)';
          e.target.style.boxShadow = 'none';
        }}
      />
    </label>
  );
}

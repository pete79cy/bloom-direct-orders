/** iOS-style search input with leading magnifier. */
export function MobileSearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        background: 'var(--ios-fill-3)',
        borderRadius: 10,
        padding: '8px 10px',
        marginBottom: 14,
      }}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ color: 'var(--ios-ink-sec)' }}
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          flex: 1,
          background: 'transparent',
          border: 0,
          outline: 0,
          color: 'var(--ios-ink)',
          fontSize: 15,
          fontFamily: 'inherit',
        }}
      />
    </div>
  );
}

export default MobileSearchInput;

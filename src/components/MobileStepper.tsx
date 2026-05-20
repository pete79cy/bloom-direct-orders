/**
 * Multi-step progress indicator for wizard-style flows.
 *
 * Each step is a short horizontal bar (brand green when active/completed,
 * gray otherwise). When `current` advances, bars fill in cascade — each
 * bar's transition starts 60ms after the previous one. This sells the
 * sense of forward progression rather than a binary swap of all bars at
 * once.
 *
 * Labels also stagger their colour transitions, but slightly faster
 * (40ms apart) so the text catches up by the time the cascade settles.
 */
export function MobileStepper({
  steps,
  current,
}: {
  steps: string[];
  current: number;
}) {
  return (
    <div style={{ padding: '12px 16px 10px' }}>
      <div style={{ display: 'flex', gap: 4 }}>
        {steps.map((_, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              height: 3,
              borderRadius: 3,
              background: i <= current ? 'var(--ios-brand)' : 'var(--ios-fill-3)',
              transition: 'background 260ms var(--ease-out-strong)',
              transitionDelay: `${i * 60}ms`,
            }}
          />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
        {steps.map((label, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              fontSize: 10,
              fontWeight: i === current ? 700 : 600,
              letterSpacing: 0.3,
              textTransform: 'uppercase',
              color: i <= current ? 'var(--ios-brand)' : 'var(--ios-ink-ter)',
              textAlign: 'center',
              transition: 'color 220ms var(--ease-out-strong)',
              transitionDelay: `${i * 40}ms`,
            }}
          >
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}

export default MobileStepper;

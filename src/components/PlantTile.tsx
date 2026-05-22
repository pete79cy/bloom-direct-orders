/**
 * Striped image placeholder with a monospace SKU label.
 * Used in list rows and variant cards in lieu of real plant photos.
 * Pattern from the design package: 45° diagonal stripes on sage-tinted bg.
 */
interface Props {
  /** Short identifier shown at the bottom — typically the variant_code's leaf. */
  label: string;
  size?: number;
}

export default function PlantTile({ label, size = 56 }: Props) {
  return (
    <div
      className="plant-tile"
      style={{
        width: size,
        height: size,
        borderRadius: 10,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        paddingBottom: 6,
        fontFamily: 'var(--font-mono)',
        fontSize: 9,
        color: 'var(--sage-700)',
        letterSpacing: 0,
        flex: '0 0 auto',
      }}
    >
      {label}
    </div>
  );
}

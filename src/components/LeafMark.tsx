/**
 * Minimal botanical mark — a single sage-tinted sprout used as an
 * accent across the app (login hero, sheet headers, empty states).
 * Pure inline SVG so it animates cheaply and adapts to currentColor.
 */
interface Props {
  className?: string;
  size?: number;
}

export default function LeafMark({ className, size = 28 }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* Stem */}
      <path
        d="M16 28 V16"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        opacity="0.55"
      />
      {/* Left leaf */}
      <path
        d="M16 18 C 11 18, 7 15, 6 9 C 11 9, 15 12, 16 18 Z"
        fill="currentColor"
        opacity="0.85"
      />
      {/* Right leaf — slightly higher */}
      <path
        d="M16 14 C 21 14, 25 11, 26 5 C 21 5, 17 8, 16 14 Z"
        fill="currentColor"
      />
      {/* Hairline vein on right leaf */}
      <path
        d="M17 13 Q 21 10, 25 6.5"
        stroke="rgba(255,255,255,0.45)"
        strokeWidth="0.6"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

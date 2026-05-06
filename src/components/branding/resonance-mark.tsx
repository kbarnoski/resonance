/**
 * Resonance brand mark — the same stylized branching/spiral SVG used
 * in the sidebar nav. Defined once here so the kiosk intro screens,
 * Begin overlay, and any future hero placement all use the exact
 * same shape.
 *
 * `size` controls width/height in pixels (square). For responsive
 * sizing, pass `style={{ width: "clamp(...)", height: "auto" }}` and
 * leave `size` undefined.
 */
interface Props {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
  /** Stroke color override. Default `currentColor`. */
  color?: string;
  strokeWidth?: number;
}

export function ResonanceMark({
  size,
  className,
  style,
  color = "currentColor",
  strokeWidth = 1.5,
}: Props) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      width={size}
      height={size}
      className={className}
      style={style}
      strokeWidth={strokeWidth}
      stroke={color}
      aria-hidden
    >
      <path d="M12 3C12 3 12 8 12 12C12 16 12 21 12 21" strokeLinecap="round" />
      <path d="M12 7C14.5 7 16.5 5.5 16.5 3.5" strokeLinecap="round" />
      <path d="M12 12C9 12 6.5 10 6.5 7.5" strokeLinecap="round" />
      <path d="M12 17C15 17 17.5 15 17.5 12.5" strokeLinecap="round" />
    </svg>
  );
}

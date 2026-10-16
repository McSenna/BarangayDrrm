/**
 * Placeholder block shown while data loads, sized like the real content so
 * nothing shifts when it arrives. `onDark` for navy surfaces.
 */
export default function Skeleton({ width = "100%", height = 16, radius, onDark = false, className = "" }) {
  return (
    <span
      className={`skeleton${onDark ? " skeleton-on-dark" : ""}${className ? ` ${className}` : ""}`}
      style={{ width, height, borderRadius: radius }}
      aria-hidden="true"
    />
  );
}

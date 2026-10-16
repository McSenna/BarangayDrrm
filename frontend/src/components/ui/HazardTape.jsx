// Full class names so Tailwind keeps them in the build.
const VARIANT_CLASS = {
  orange: "hazard-tape-strip hazard-tape-orange",
  red: "hazard-tape-strip hazard-tape-red",
};

/** The 6px diagonal hazard-tape strip: orange/navy, or red/navy. Decorative. */
export default function HazardTape({ variant = "orange", className = "" }) {
  return <div className={`${VARIANT_CLASS[variant] || VARIANT_CLASS.orange}${className ? ` ${className}` : ""}`} aria-hidden="true" />;
}

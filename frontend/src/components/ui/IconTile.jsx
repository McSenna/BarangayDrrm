// Full class names so Tailwind keeps them in the build.
const TONE_CLASS = {
  navy: "icon-tile icon-tile-navy",
  red: "icon-tile icon-tile-red",
  "red-soft": "icon-tile icon-tile-red-soft",
  orange: "icon-tile icon-tile-orange",
  green: "icon-tile icon-tile-green",
  white: "icon-tile icon-tile-white",
  "on-navy": "icon-tile icon-tile-on-navy",
};
const SIZE = { sm: 32, md: 40, lg: 52 };

/** A square tile holding one lucide icon. Decorative: the label beside it carries the meaning. */
export default function IconTile({ icon: Icon, tone = "navy", size = "md", className = "" }) {
  const px = SIZE[size] || SIZE.md;
  return (
    <span className={`${TONE_CLASS[tone] || TONE_CLASS.navy}${className ? ` ${className}` : ""}`} style={{ width: px, height: px }} aria-hidden="true">
      <Icon size={Math.round(px * 0.46)} strokeWidth={2} />
    </span>
  );
}

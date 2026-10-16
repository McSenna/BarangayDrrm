// Full class names so Tailwind keeps them in the build.
const TONE_CLASS = { ok: "capacity-ok", pending: "capacity-pending", critical: "capacity-critical" };

/**
 * A horizontal bar with an explicit tone (ok = green, pending = orange,
 * critical = red). Exposed as an image with a text label, so the value is
 * never conveyed by colour alone. For data-derived thresholds see CapacityBar.
 */
export default function ProgressBar({ value, max, tone = "ok", label }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div className="capacity-track" role="img" aria-label={label}>
      <span className={`capacity-fill ${TONE_CLASS[tone] || TONE_CLASS.ok}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

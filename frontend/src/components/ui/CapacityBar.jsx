/**
 * Available-vs-capacity bar (evacuation slots, stock). The fill turns orange
 * at 20% or less available and red when none are left.
 */
export default function CapacityBar({ available, capacity, label = "Available capacity" }) {
  const cap = Math.max(0, Number(capacity) || 0);
  const avail = Math.min(cap, Math.max(0, Number(available) || 0));
  const pct = cap > 0 ? Math.round((avail / cap) * 100) : 0;
  // Full class names so Tailwind keeps them in the build.
  const fillClass = cap === 0 ? "capacity-empty" : avail === 0 ? "capacity-critical" : pct <= 20 ? "capacity-pending" : "capacity-ok";

  return (
    <div
      className="capacity-track"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={cap}
      aria-valuenow={avail}
      aria-valuetext={`${avail} of ${cap} available (${pct}%)`}
    >
      <span className={`capacity-fill ${fillClass}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

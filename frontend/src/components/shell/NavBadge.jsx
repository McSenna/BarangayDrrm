/**
 * Live count on a sidebar item.
 *   pending  orange badge, navy text   (items waiting for action)
 *   critical red badge, white text     (active hazards)
 *   off      muted "Off" text          (a disabled service, e.g. SMS)
 * Screen readers hear the meaning too ("3 pending"), not just a bare number.
 */
const SR_SUFFIX = { pending: "pending", critical: "active" };

export default function NavBadge({ badge }) {
  if (!badge) return null;
  if (badge.kind === "off") {
    return <span className="nav-badge-off">Off</span>;
  }
  const cls = badge.kind === "critical" ? "nav-badge nav-badge-critical" : "nav-badge nav-badge-pending";
  const shown = badge.value > 99 ? "99+" : badge.value;
  return (
    <span className={cls}>
      {shown}
      <span className="sr-only"> {SR_SUFFIX[badge.kind]}</span>
    </span>
  );
}

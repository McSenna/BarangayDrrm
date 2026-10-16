import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

// Full class names so Tailwind keeps them in the build.
const TONE_CLASS = {
  critical: "kpi-card kpi-critical",
  pending: "kpi-card kpi-pending",
  ok: "kpi-card kpi-ok",
};

/**
 * Clickable "needs your action" card: 4px top band (red = critical,
 * orange = waiting, green = clear/available), icon tile, big number,
 * "Open … →". The whole card is one link to the page that resolves it.
 */
export default function KpiCard({ to, icon: Icon, label, value, tone = "pending", linkLabel, children }) {
  return (
    <Link to={to} className={TONE_CLASS[tone] || TONE_CLASS.pending}>
      <span className="kpi-head">
        <span className="kpi-tile" aria-hidden="true">
          <Icon size={20} strokeWidth={2} />
        </span>
        <span className="kpi-label">{label}</span>
      </span>
      <span className="kpi-value">{value}</span>
      {children}
      <span className="kpi-link">
        Open {linkLabel}
        <ArrowRight className="kpi-arrow" aria-hidden="true" size={15} strokeWidth={2.25} />
      </span>
    </Link>
  );
}

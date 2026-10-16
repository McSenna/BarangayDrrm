import { Link } from "react-router-dom";
import Button from "../ui/Button.jsx";
import StatusBadge from "../ui/StatusBadge.jsx";

/**
 * One core-module card on the dashboard.
 *   header: slate band, navy number tile, title, optional status badge
 *   body:   <MetricRow> children (label + toned value)
 *   footer: navy primary button + secondary text link
 */
export default function ModuleCard({ id, number, title, status, action, secondary, children }) {
  const headingId = `module-${id}`;
  return (
    <section className="module-card" aria-labelledby={headingId}>
      <div className="module-head">
        <span className="module-num" aria-hidden="true">{number}</span>
        <h3 id={headingId} className="module-title">{title}</h3>
        {status && <StatusBadge tone={status.tone}>{status.label}</StatusBadge>}
      </div>
      <dl className="metric-list module-body">{children}</dl>
      <div className="module-foot">
        <Button size="sm" to={action.to}>{action.label}</Button>
        {secondary && <Link className="module-link" to={secondary.to}>{secondary.label}</Link>}
      </div>
    </section>
  );
}

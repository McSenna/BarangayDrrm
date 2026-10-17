import { Link } from "react-router-dom";

// Full class names so Tailwind keeps them in the build.
const STAGES = [
  { key: "pending", label: "Pending assessment", cls: "pipe-fill pipe-pending" },
  { key: "approved", label: "Assessment in progress", cls: "pipe-fill pipe-approved" },
  { key: "ready", label: "Ready for distribution", cls: "pipe-fill pipe-ready" },
  { key: "distributed", label: "Completed", cls: "pipe-fill pipe-distributed" },
];

/**
 * Relief allocations by stage, as labelled horizontal bars (plain HTML, so
 * every value is text). Each row opens Relief Allocations.
 */
export default function PipelineChart({ pipeline }) {
  const p = pipeline || {};
  const max = Math.max(1, ...STAGES.map((s) => p[s.key] || 0));
  const total = STAGES.reduce((sum, s) => sum + (p[s.key] || 0), 0);

  if (total === 0) {
    return <p className="chart-empty chart-empty-static">No relief allocations in this period.</p>;
  }

  return (
    <div className="pipe">
      <ol className="pipe-list">
        {STAGES.map((s) => {
          const value = p[s.key] || 0;
          return (
            <li key={s.key}>
              <Link to="/admin/allocations" className="pipe-row">
                <span className="pipe-label">{s.label}</span>
                <span className="pipe-track" aria-hidden="true">
                  <span className={s.cls} style={{ width: `${value ? Math.max(3, (value / max) * 100) : 0}%` }} />
                </span>
                <span className="pipe-value">{value}</span>
              </Link>
            </li>
          );
        })}
      </ol>
      <p className="pipe-note">
        {p.households_served ?? 0} {p.households_served === 1 ? "household" : "households"} received relief in this period.
      </p>
    </div>
  );
}

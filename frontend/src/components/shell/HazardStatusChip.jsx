import { Link } from "react-router-dom";
import { CircleCheck, Siren, TriangleAlert } from "lucide-react";
import { useShellStatus } from "../../context/ShellStatusContext.jsx";
import { summarizeAlerts } from "../../utils/hazardSummary.js";

/**
 * Barangay-wide hazard status in the header, from the public hazard-status
 * endpoint (the highest level among active alerts).
 *   Critical          red chip, white text
 *   Warning / Alert   orange chip, navy text
 *   Normal            green-tint chip, green-ink text
 * Links to Hazard Monitoring for roles that have it.
 */
const LEVELS = {
  Critical: { cls: "status-chip-critical", Icon: Siren },
  Warning: { cls: "status-chip-warning", Icon: TriangleAlert },
  Alert: { cls: "status-chip-warning", Icon: TriangleAlert },
  Normal: { cls: "status-chip-normal", Icon: CircleCheck },
};

export default function HazardStatusChip({ to }) {
  const { hazard } = useShellStatus();
  if (!hazard) return <span className="status-chip-slot" aria-hidden="true" />;

  const level = LEVELS[hazard.overall_status] ? hazard.overall_status : "Normal";
  const { cls, Icon } = LEVELS[level];
  const summary = summarizeAlerts(hazard.active_alerts);

  // The summary is hidden visually on small screens but stays in the accessible name.
  const body = (
    <>
      <span className={`status-chip ${cls}`}>
        <span className="status-chip-icon" aria-hidden="true">
          <Icon size={15} strokeWidth={2.25} />
        </span>
        <span><span className="sr-only">Barangay hazard </span>Status: {level}</span>
      </span>
      <span className="status-summary"><span className="sr-only">, </span>{summary}</span>
    </>
  );

  return (
    <div className="status-chip-wrap" aria-live="polite">
      {to ? (
        <Link to={to} className="status-chip-link">{body}</Link>
      ) : (
        <span className="status-chip-link">{body}</span>
      )}
    </div>
  );
}

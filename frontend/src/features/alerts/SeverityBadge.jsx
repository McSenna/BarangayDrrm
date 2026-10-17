import { Info, Siren, TriangleAlert } from "lucide-react";
import { SEVERITY_META, severityOf } from "./alertModel.js";

export const SEVERITY_ICON = { Critical: Siren, Warning: TriangleAlert, Advisory: Info };

/** Severity pill: icon + label, never colour alone. Critical solid red; Warning orange tint; Advisory amber tint. */
export default function SeverityBadge({ severity, className = "" }) {
  const s = severityOf(severity);
  const Icon = SEVERITY_ICON[s];
  return (
    <span className={`sev-badge sev-badge--${s.toLowerCase()}${className ? ` ${className}` : ""}`}>
      <Icon aria-hidden="true" size={14} strokeWidth={2.4} />
      {SEVERITY_META[s].label}
    </span>
  );
}

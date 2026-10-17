import { useId } from "react";
import { ChevronDown, CloudOff, Flame, Mountain, Waves, Wind, Activity, TriangleAlert, LoaderCircle } from "lucide-react";
import SeverityBadge from "./SeverityBadge.jsx";
import { SEVERITY_META, areaLabel, formatManila, formatManilaTime, highestSeverity } from "./alertModel.js";
import { alertGeometryGaps } from "./alertGeometry.js";
import "./alerts.css";

const TYPE_ICON = { Flood: Waves, Typhoon: Wind, Fire: Flame, Landslide: Mountain, Earthquake: Activity };

function count(n) {
  return `${n} active ${n === 1 ? "alert" : "alerts"}`;
}

/** One alert row: a toggle button (title, severity, area, time, instructions) and its details when selected. */
function AlertItem({ alert, selected, onSelect, gaps }) {
  const detailsId = useId();
  const Icon = TYPE_ICON[alert.type] || TriangleAlert;
  const missing = gaps.filter((g) => g.alertId === alert.id).map((g) => g.area);
  const drawn = alert.scope === "barangay" ? "the barangay boundary" : alert.puroks.filter((p) => !missing.includes(p)).join(", ");
  return (
    <li className={`aa-item aa-item--${alert.severity.toLowerCase()}${selected ? " is-selected" : ""}`}>
      <button type="button" className="aa-item-btn" aria-expanded={selected} aria-controls={detailsId} onClick={() => onSelect(selected ? null : alert.id)}>
        <span className="aa-item-icon" aria-hidden="true"><Icon size={18} strokeWidth={2.2} /></span>
        <span className="aa-item-main">
          <span className="aa-item-top">
            <SeverityBadge severity={alert.severity} />
            <span className="aa-item-type">{alert.type}</span>
          </span>
          <span className="aa-item-title">{alert.title}</span>
          <span className="aa-item-meta">
            <span><span className="sr-only">Affected area: </span>{areaLabel(alert)}</span>
            {alert.activatedAt && <span>Active since <time dateTime={alert.activatedAt}>{formatManila(alert.activatedAt)}</time></span>}
          </span>
        </span>
        <ChevronDown className="aa-item-chev" aria-hidden="true" size={18} strokeWidth={2.4} />
        <span className="sr-only">{selected ? ", details shown, highlighted on the map" : ", show details and highlight on the map"}</span>
      </button>
      {alert.instructions && (
        <div className="aa-instructions">
          <strong>What to do</strong>
          <p>{alert.instructions}</p>
        </div>
      )}
      <div id={detailsId} className="aa-details" hidden={!selected}>
        {alert.description && <p className="aa-description">{alert.description}</p>}
        <p className="aa-area-note">
          {drawn && <>Highlighted on the map: {drawn}. The outline shows the whole affected area, not an exact incident location.</>}
          {missing.length > 0 && <> {missing.join(", ")} {missing.length === 1 ? "has" : "have"} no verified map outline, so {missing.length === 1 ? "it is" : "they are"} listed here but not drawn.</>}
        </p>
        {alert.updatedAt && alert.updatedAt !== alert.activatedAt && (
          <p className="aa-updated">Last changed <time dateTime={alert.updatedAt}>{formatManila(alert.updatedAt)}</time></p>
        )}
      </div>
    </li>
  );
}

/**
 * "Active Barangay Alerts" next to the map (public Home map and staff Barangay Map). Every active alert is
 * listed with its severity, area, activation time and instructions, highest severity first, so overlapping
 * alerts all stay reachable. Selecting one shows its details and emphasises its area on the map.
 * A failed refresh keeps the last alerts and says they may be outdated; it never shows "No active alerts".
 */
export default function ActiveAlertsPanel({ alerts, status, outdated, lastSuccessAt, selectedId, onSelect, className = "" }) {
  const titleId = useId();
  const highest = highestSeverity(alerts);
  const gaps = alertGeometryGaps(alerts);
  const ready = status === "ready";
  const tone = ready && highest ? highest.toLowerCase() : "none";

  return (
    <section className={`aa aa--${tone}${className ? ` ${className}` : ""}`} aria-labelledby={titleId}>
      <header className="aa-head">
        <h2 id={titleId} className="aa-title">Active Barangay Alerts</h2>
        {ready && alerts.length > 0 && <span className="aa-count">{alerts.length}</span>}
      </header>

      <div className="aa-summary" role="status" aria-live="polite">
        {status === "loading" && <p className="aa-muted"><LoaderCircle className="aa-spin" aria-hidden="true" size={15} /> Checking for active barangay alerts…</p>}
        {status === "error" && (
          <p className="aa-problem"><CloudOff aria-hidden="true" size={16} strokeWidth={2.2} />
            We can't reach barangay alert records right now, so active alerts can't be shown. Retrying automatically.</p>
        )}
        {ready && alerts.length === 0 && (
          <div className="aa-empty">
            <p className="aa-empty-title">No active barangay alerts.</p>
            <p className="aa-muted">This means no alert has been issued for Barangay Binitayan right now. It does not mean an area is safe — follow official advisories and call the barangay in an emergency.</p>
          </div>
        )}
        {ready && alerts.length > 0 && (
          <p className="aa-highest">
            {count(alerts.length)} · Highest severity <SeverityBadge severity={highest} />
            {alerts.length > 1 && <span className="aa-muted"> Lower-severity alerts are listed below it.</span>}
          </p>
        )}
        {outdated && (
          <p className="aa-problem">
            <TriangleAlert aria-hidden="true" size={16} strokeWidth={2.2} />
            <span>Alert information may be outdated. Last successful update {formatManilaTime(lastSuccessAt)}. Retrying automatically.</span>
          </p>
        )}
      </div>

      {alerts.length > 0 && (
        <ul className="aa-list" role="list">
          {alerts.map((a) => <AlertItem key={a.id} alert={a} selected={selectedId === a.id} onSelect={onSelect} gaps={gaps} />)}
        </ul>
      )}

      {lastSuccessAt && !outdated && (
        <p className="aa-foot">Updated <time dateTime={lastSuccessAt.toISOString()}>{formatManilaTime(lastSuccessAt)}</time> Philippine time · refreshes automatically</p>
      )}
    </section>
  );
}

/** Severity scale for map legends: the three alert outlines (dash pattern + colour + label). */
export function AlertLegendItems() {
  return ["Advisory", "Warning", "Critical"].map((s) => (
    <li key={s}>
      <svg className={`aa-key aa-key--${s.toLowerCase()}`} viewBox="0 0 28 16" aria-hidden="true">
        <rect className="aa-key-casing" x="3" y="3" width="22" height="10" rx="2" />
        <rect className="aa-key-line" x="3" y="3" width="22" height="10" rx="2" />
      </svg>
      Active alert area — {SEVERITY_META[s].label}
    </li>
  ));
}

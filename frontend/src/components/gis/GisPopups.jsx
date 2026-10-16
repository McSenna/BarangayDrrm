import { MapPin, Maximize2, Rows3 } from "lucide-react";
import StatusBadge from "../ui/StatusBadge.jsx";
import { purokLabel } from "../../utils/purokLabel.js";
import { FLOOD_STATUS, DESIGNATION_LABEL } from "../../config/floodZones.js";
import { isFloodProne } from "../map/OverlayLayers.jsx";

const PRIORITY_TONE = { "Critical Priority": "critical", "High Priority": "high", "Moderate Priority": "warning", "Low Priority": "ok" };

export const REVIEW_LABEL = {
  match: "Matches stored Purok",
  mismatch: "Stored Purok differs",
  on_boundary: "On a Purok edge",
  ambiguous: "Inside two Puroks",
  outside_all: "Between Purok boundaries",
  outside_barangay: "Outside the barangay",
  unverified_area: "In an unverified Purok",
  no_coordinates: "No coordinates",
};

const fmt = (n) => (typeof n === "number" ? n.toFixed(7) : "—");

/**
 * HOUSEHOLD INFORMATION — one household's record from the database, plus the
 * server's location check. Shown to Administrator and Relief Personnel only
 * (the page itself is closed to residents and the public).
 */
export function HouseholdPopup({ h, canEdit, inHazardPurok, affected, onAssign }) {
  const fs = FLOOD_STATUS[h.flood_status] || FLOOD_STATUS.unverified;
  const areas = affected?.areas || [];
  const recorded = areas.filter((a) => !isFloodProne(a));
  const drawnProne = areas.filter(isFloodProne);
  return (
    <div className="gis-pop">
      <div className="gis-pop-head">
        <p className="gis-pop-kicker">Household information</p>
        <StatusBadge tone={fs.badge}>{fs.heading}</StatusBadge>
      </div>
      <p className="gis-pop-title">{h.head_of_family || "Name not recorded"}</p>
      <p className="gis-pop-sub">Household #{h.household_id} · Head of household</p>
      <dl className="gis-pop-dl">
        <dt>Address</dt><dd>{h.address || "Not recorded"}</dd>
        <dt>Purok</dt><dd>{h.purok ? purokLabel(h.purok) : "Not recorded"}</dd>
        <dt>Members</dt><dd>{h.number_of_members ?? "—"}{h.vulnerable_members > 0 ? ` (${h.vulnerable_members} vulnerable)` : ""}</dd>
        <dt>Location check</dt>
        <dd>{REVIEW_LABEL[h.location_status] || "Not checked"}{h.spatial_purok && h.location_status !== "match" ? ` — inside ${h.spatial_purok}` : ""}</dd>
        {h.priority_level && (
          <><dt>DSS priority</dt><dd><StatusBadge tone={PRIORITY_TONE[h.priority_level] || "neutral"}>{h.priority_level}</StatusBadge>{h.priority_score != null && <span className="gis-pop-muted"> {h.priority_score}/100</span>}</dd></>
        )}
        {h.latest_severity && h.latest_severity !== "No report" && (
          <><dt>Disaster report</dt><dd>{h.latest_severity} severity ({h.latest_report_status})</dd></>
        )}
        <dt>Latitude</dt><dd className="gis-num">{fmt(h.latitude)}</dd>
        <dt>Longitude</dt><dd className="gis-num">{fmt(h.longitude)}</dd>
      </dl>
      {h.needs_review && h.location_note && <p className="gis-pop-note">{h.location_note}</p>}
      {inHazardPurok && <p className="gis-pop-alert">Active hazard alert in this household's Purok.</p>}
      {recorded.length > 0 && <p className="gis-pop-alert">Inside recorded affected area: {recorded.map((a) => a.area_name).join(", ")}.</p>}
      {drawnProne.length > 0 && <p className="gis-pop-muted">Inside recorded flood-prone area: {drawnProne.map((a) => a.area_name).join(", ")} (at risk, not confirmed flooded).</p>}
      <p className="gis-pop-foot">Status from the map location and the barangay's Purok designation — not a flood-severity measurement.</p>
      {canEdit && (
        <div className="gis-pop-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onAssign(h)}>
            <MapPin aria-hidden="true" size={14} strokeWidth={2.25} />Move location
          </button>
        </div>
      )}
    </div>
  );
}

/** PUROK INFORMATION / FLOOD-PRONE ZONE — counts come from purok_classification.php. */
export function PurokPopup({ purok, stats, onZoom, onFilter }) {
  const flood = purok.designation === "flood_prone";
  return (
    <div className="gis-pop">
      <div className="gis-pop-head">
        <p className={`gis-pop-kicker${flood ? " is-flood" : ""}`}>{flood ? "Flood-prone zone" : "Purok information"}</p>
      </div>
      <p className="gis-pop-title">{purok.name}</p>
      <p className="gis-pop-sub">Barangay Binitayan · Daraga · Albay</p>
      <dl className="gis-pop-dl">
        <dt>Status</dt><dd><strong className={flood ? "gis-ink-red" : undefined}>{flood ? "Designated flood-prone zone" : DESIGNATION_LABEL.not_designated}</strong></dd>
        <dt>Registered households</dt><dd className="gis-num">{stats ? stats.registered : "—"}</dd>
        <dt>Mapped households</dt><dd className="gis-num">{stats ? stats.mapped : "—"}</dd>
        <dt>Located inside this boundary</dt><dd className="gis-num">{stats ? stats.inside_polygon : "—"}</dd>
      </dl>
      <p className="gis-pop-note">
        {flood
          ? "This purok is designated as flood-prone in the barangay mapping system."
          : "No flood-prone designation is recorded for this purok. This does not mean it is safe from flooding."}
      </p>
      <p className="gis-pop-foot">Registered and mapped counts use each household's stored Purok. The boundary is a candidate supplied by the project team, not an official survey.</p>
      <div className="gis-pop-actions">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onZoom}><Maximize2 aria-hidden="true" size={14} strokeWidth={2.25} />Zoom to Purok</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onFilter}><Rows3 aria-hidden="true" size={14} strokeWidth={2.25} />List households</button>
      </div>
    </div>
  );
}

import { useEffect, useId, useState } from "react";
import { CircleCheck, MapPin, Siren, TriangleAlert } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { purokLabel } from "../utils/purokLabel.js";
import { hazardSeverity, summarizeAlerts } from "../utils/hazardSummary.js";
import { getPublicHazardStatus } from "../services/api.jsx";
import Button from "./ui/Button.jsx";

// Full class names per severity so Tailwind keeps them in the build.
const SEVERITY_CLASS = {
  critical: "hazard-banner hazard-critical",
  warning: "hazard-banner hazard-warning",
  normal: "hazard-banner hazard-normal",
};
const MAP_LINK = { admin: "/admin/map", relief_personnel: "/personnel/map", field_officer: "/field/map" };

/**
 * Barangay hazard status banner. Critical: red hazard-tape edge, red tile,
 * red Purok chips, red "Respond on map". Alert/Warning: the same layout in
 * orange. `compact` (dashboards) shows nothing while the status is Normal.
 */
export default function HazardBanner({ compact = false, refreshKey = 0 }) {
  const [data, setData] = useState(null);
  const { user } = useAuth();
  const headingId = useId();

  // refreshKey (Phase 19): dashboards bump it on each auto-refresh so the banner stays current.
  useEffect(() => {
    getPublicHazardStatus().then((res) => setData(res.data.data)).catch(() => {});
  }, [refreshKey]);

  if (!data) return null;

  // In compact mode, say nothing when everything is normal — no need to clutter dashboards.
  if (compact && data.overall_status === "Normal") return null;

  const severity = hazardSeverity(data.overall_status);
  const alerts = data.active_alerts || [];
  const mapLink = MAP_LINK[user?.role];
  const Icon = severity === "critical" ? Siren : severity === "warning" ? TriangleAlert : CircleCheck;
  const headline = severity === "normal"
    ? "Normal — no active hazard alerts"
    : `${data.overall_status}: ${summarizeAlerts(alerts)}`;

  return (
    <section className={SEVERITY_CLASS[severity]} aria-labelledby={headingId}>
      {severity !== "normal" && <div className="hazard-tape" aria-hidden="true" />}
      <div className="hazard-body">
        <span className="hazard-tile" aria-hidden="true">
          <Icon size={24} strokeWidth={2} />
        </span>
        <div className="hazard-main">
          {/* Dashboards (compact) let the headline speak; the label stays for screen readers. */}
          <p className={compact ? "sr-only" : "hazard-label"}>Barangay hazard status</p>
          <h2 id={headingId} className="hazard-headline">{headline}</h2>

          {alerts.length > 0 && (
            <ul className="hazard-list" role="list">
              {alerts.map((a) => (
                <li key={a.alert_id} className="hazard-row">
                  <span className="purok-tag">{a.affected_purok ? purokLabel(a.affected_purok) : "Barangay-wide"}</span>
                  <span className="hazard-row-text">
                    <strong>{a.hazard_type}</strong> — {a.title}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {!compact && data.latest_weather && (
            <p className="hazard-weather">
              Latest Weather ({data.latest_weather.log_date}): {data.latest_weather.weather_condition},{" "}
              {data.latest_weather.temperature !== null ? `${data.latest_weather.temperature}°C` : "—"},{" "}
              Rainfall: {data.latest_weather.rainfall_mm ?? "—"} mm,{" "}
              Wind: {data.latest_weather.wind_speed_kph ?? "—"} km/h {data.latest_weather.wind_direction || ""}
            </p>
          )}
        </div>

        {mapLink && severity !== "normal" && (
          <div className="hazard-actions">
            <Button variant={severity === "critical" ? "danger" : "primary"} to={mapLink} icon={MapPin}>
              Respond on map
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}

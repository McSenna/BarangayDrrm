import { Flame, Info, MapPin, Mountain, Siren, TriangleAlert, Waves } from "lucide-react";
import Button from "../../components/ui/Button.jsx";
import IconTile from "../../components/ui/IconTile.jsx";
import { summarizeAlerts } from "../../utils/hazardSummary.js";
import { NO_ALERTS_TITLE } from "./mappers.js";

const TYPE_ICON = { flood: Waves, flash_flood: Mountain, landslide: Mountain, fire: Flame, other: TriangleAlert };
const WEATHER_WORDS = /(flood|typhoon|storm|rain|wind|weather|cyclone)/i;

// Full class names so Tailwind keeps them in the build.
const LEVEL = {
  critical: { cls: "alert-card alert-critical", icon: Siren, tile: "white" },
  warning: { cls: "alert-card alert-warning", icon: TriangleAlert, tile: "white" },
  // No alert in effect: neutral icon, never a check mark — no alert does not mean an area is safe.
  normal: { cls: "alert-card alert-normal", icon: Info, tile: "navy" },
};

/** Card title for each level (critical: "2 active flood incidents"). */
export function alertTitle(hazard) {
  if (hazard.level === "critical") return summarizeAlerts(hazard.incidents, (i) => i.title);
  if (hazard.level === "warning") {
    const weather = hazard.incidents.length > 0 && hazard.incidents.every((i) => WEATHER_WORDS.test(i.title));
    return weather ? "Weather advisory in effect" : "Hazard advisory in effect";
  }
  return NO_ALERTS_TITLE;
}

/** One affected Purok: tinted card, hazard icon, "Purok 7 · Flood", one-line headline. */
export function AffectedAreaCard({ incident }) {
  const strong = incident.severity === "critical" || incident.severity === "high";
  return (
    <li className={strong ? "area-card area-card-red" : "area-card area-card-orange"}>
      <IconTile icon={TYPE_ICON[incident.type] || TriangleAlert} tone={strong ? "red" : "orange"} size="md" />
      <div className="area-card-text">
        <h5 className="area-card-title">{incident.purok} · {incident.title}</h5>
        {incident.description && <p className="area-card-desc">{incident.description}</p>}
      </div>
    </li>
  );
}

/** Numbered advisory steps (admin-edited in System Settings). */
export function AdvisorySteps({ title, steps }) {
  if (!steps?.length) return null;
  return (
    <div className="advisory">
      <h4 className="lp-eyebrow advisory-title">{title}</h4>
      <ol className="advisory-list">
        {steps.map((s, i) => (
          <li key={i}><span className="advisory-num" aria-hidden="true">{i + 1}</span>{s}</li>
        ))}
      </ol>
    </div>
  );
}

/**
 * Barangay alert card. critical = red header, warning = orange header (navy
 * text), normal = green-tint "no alert in effect" (neutral icon, never "all clear") with preparedness tips instead of
 * affected areas. The header is a polite live region, so a level change is
 * announced without interrupting.
 */
export default function AlertCard({ hazard, hasOpenCenters, hotlineHref }) {
  const { level } = hazard;
  const cfg = LEVEL[level] || LEVEL.normal;
  const active = level !== "normal";

  return (
    <article className={cfg.cls} aria-labelledby="alert-title">
      <div className="alert-head">
        <IconTile icon={cfg.icon} tone={cfg.tile} size="lg" />
        <div className="alert-head-text" role="status" aria-live="polite">
          <p className="lp-eyebrow alert-level">{active ? `Alert level: ${hazard.statusLabel}` : "No alert in effect"}</p>
          <h3 id="alert-title" className="alert-title">{alertTitle(hazard)}</h3>
        </div>
        {active && (
          <Button variant={level === "critical" ? "white-red" : "primary"} to={{ hash: "#hazard-map" }} icon={MapPin} className="alert-map-btn">
            View on map
          </Button>
        )}
      </div>

      <div className="alert-body">
        {active && hazard.incidents.length > 0 && (
          <div>
            <h4 className="lp-eyebrow alert-sub">Affected areas</h4>
            <ul className="area-grid" role="list">
              {hazard.incidents.map((i) => <AffectedAreaCard key={i.id} incident={i} />)}
            </ul>
          </div>
        )}

        <AdvisorySteps title={active ? "What to do now" : "Be ready before the next storm"} steps={hazard.advisorySteps} />

        <div className="alert-actions">
          {active ? (
            <>
              {hasOpenCenters ? (
                <Button variant="primary" size="lg" to={{ hash: "#evacuation" }}>Find an evacuation center</Button>
              ) : (
                hotlineHref && <Button variant="primary" size="lg" href={hotlineHref}>Call the barangay for evacuation</Button>
              )}
              <Button variant="outline-navy" size="lg" to="/register">Get SMS alerts</Button>
            </>
          ) : (
            <Button variant="primary-orange" size="lg" to="/register">Register your household</Button>
          )}
        </div>
      </div>
    </article>
  );
}

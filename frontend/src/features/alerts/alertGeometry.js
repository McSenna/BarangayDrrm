/**
 * Which alert areas can be drawn from EXISTING verified geometry (no Leaflet here, so the alert panel can
 * use it without loading the map). Puroks come from the validated candidate boundaries
 * (utils/purokBoundaries.js); a Purok that failed validation, or an older non-standard area, is a "gap":
 * listed as text, never drawn.
 */
import { PUROK_BOUNDARIES } from "../../utils/purokBoundaries.js";
import { alertAreas } from "./alertModel.js";

export const PUROK_FEATURES = new Map(PUROK_BOUNDARIES.items.filter((it) => it.valid && it.feature?.geometry).map((it) => [it.name, it.feature]));
export const ALERT_GEOMETRY_PUROKS = [...PUROK_FEATURES.keys()];

/** Areas of these alerts that have no verified map geometry: [{ alertId, area }]. */
export function alertGeometryGaps(alerts) {
  return alertAreas(alerts, ALERT_GEOMETRY_PUROKS).missing;
}

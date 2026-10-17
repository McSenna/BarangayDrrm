import { useMemo } from "react";
import { GeoJSON, Pane } from "react-leaflet";
import L from "leaflet";
import boundary from "../../data/binitayanBoundary.json";
import { getGeoJsonBounds } from "../../utils/geoBounds.js";
import { alertAreaStyles } from "../../theme/mapTokens.js";
import { SEVERITY_META, alertAreas } from "./alertModel.js";
import { ALERT_GEOMETRY_PUROKS, PUROK_FEATURES } from "./alertGeometry.js";

/**
 * Active barangay alert areas, drawn from the EXISTING verified geometry only: the PSA barangay boundary for
 * a barangay-wide alert, and the validated candidate Purok boundaries (whole Purok) for selected Puroks.
 * Nothing is invented: a Purok without a valid boundary is reported by alertGeometryGaps() and listed as
 * text by the panel instead of being drawn (alertGeometry.js). A separate pane from the permanent flood-prone designation, so
 * turning an alert off never touches it. Non-interactive: labels and household markers stay on top and usable.
 */
/** Bounds of one alert's drawable area (barangay-wide: the whole barangay), or null when nothing is drawable. */
export function alertBounds(alert) {
  if (alert.scope === "barangay") return L.latLngBounds(getGeoJsonBounds(boundary));
  const parts = alert.puroks.filter((p) => PUROK_FEATURES.has(p)).map((p) => L.latLngBounds(getGeoJsonBounds(PUROK_FEATURES.get(p))));
  return parts.length ? parts.reduce((acc, b) => acc.extend(b), L.latLngBounds(parts[0].getSouthWest(), parts[0].getNorthEast())) : null;
}

export default function AlertAreaLayer({ alerts, selectedId = null, pane = "alert-areas", zIndex = 440 }) {
  const shapes = useMemo(() => {
    const areas = alertAreas(alerts, ALERT_GEOMETRY_PUROKS);
    const selected = alerts.find((a) => a.id === selectedId) || null;
    const list = [];
    const push = (key, feature, area) => {
      const hit = selected && area.ids.includes(selected.id);
      const state = !selected ? "normal" : hit ? "selected" : "dimmed";
      const severity = hit ? selected.severity : area.severity;
      const order = state === "selected" ? 10 : SEVERITY_META[severity].rank;
      list.push({ key: `${key}|${severity}|${state}`, feature, styles: alertAreaStyles(severity, state), order });
    };
    if (areas.barangay) push("barangay", boundary, areas.barangay);
    for (const [name, area] of areas.puroks) push(name, PUROK_FEATURES.get(name), area);
    // Higher severity draws on top; the selected alert's areas above everything.
    return list.sort((a, b) => (a.key.startsWith("barangay|") ? -1 : b.key.startsWith("barangay|") ? 1 : a.order - b.order));
  }, [alerts, selectedId]);

  if (!shapes.length) return null;
  return (
    <Pane name={pane} style={{ zIndex }}>
      {shapes.map((s) => [
        <GeoJSON key={`c-${s.key}`} data={s.feature} style={() => s.styles[0]} interactive={false} />,
        <GeoJSON key={`l-${s.key}`} data={s.feature} style={() => s.styles[1]} interactive={false} />,
      ])}
    </Pane>
  );
}

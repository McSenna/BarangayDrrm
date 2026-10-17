import { Suspense, lazy, useEffect, useRef, useState } from "react";
import ActiveAlertsPanel, { AlertLegendItems } from "../alerts/ActiveAlertsPanel.jsx";
import { areaLabel } from "../alerts/alertModel.js";

// Leaflet is ~150 KB: load it in its own chunk, only once the map is near the viewport.
const BarangayMap = lazy(() => import("./BarangayMap.jsx"));

function useNearViewport(ref) {
  const [near, setNear] = useState(false);
  useEffect(() => {
    if (near || !ref.current) return undefined;
    if (!("IntersectionObserver" in window)) {
      setNear(true);
      return undefined;
    }
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setNear(true), { rootMargin: "300px" });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [near, ref]);
  return near;
}

/**
 * Right column of the hero: "Active Barangay Alerts" (useActiveAlerts in Home.jsx: about every 15 s, no page reload), then the
 * barangay map with the permanent flood-prone designation and the active alert areas as separate layers,
 * then the legend. Selecting an alert emphasises its area on the map.
 */
export default function MapPanel({ live }) {
  const ref = useRef(null);
  const near = useNearViewport(ref);
  const [selectedId, setSelectedId] = useState(null);
  const alerts = live.alerts;
  const selected = alerts.some((a) => a.id === selectedId) ? selectedId : null; // a turned-off alert drops its selection

  const alertText = live.status !== "ready"
    ? ""
    : alerts.length
      ? ` Active alert areas are outlined: ${alerts.map((a) => `${a.severity} ${a.type.toLowerCase()} alert, ${areaLabel(a)}`).join("; ")}.`
      : " No active barangay alerts.";
  const label = `Map of Barangay Binitayan. Puroks 1 to 4 are shaded red as designated flood-prone zones, with the Daraga Public Cemetery excluded; Puroks 5A to 7 are not currently designated.${alertText} Use the zoom buttons to look closer.`;

  return (
    <div className="lp-hero-map" id="hazard-map" ref={ref}>
      <ActiveAlertsPanel {...live} alerts={alerts} selectedId={selected} onSelect={setSelectedId} className="lp-alerts" />
      <div className="lm-card">
        <div className="lp-map-frame" role="region" aria-label={label}>
          {near ? (
            <Suspense fallback={<div className="lp-map-skeleton" aria-hidden="true" />}>
              <BarangayMap alerts={alerts} selectedId={selected} />
            </Suspense>
          ) : (
            <div className="lp-map-skeleton" aria-hidden="true" />
          )}
        </div>
        <ul className="lm-legend" role="list" aria-label="Map legend">
          <li><i className="lm-key lm-key--flood" aria-hidden="true" />Designated flood-prone Purok (permanent)</li>
          <li><i className="lm-key lm-key--neutral" aria-hidden="true" />Not currently designated (not a safety rating)</li>
          <li><i className="lm-key lm-key--excluded" aria-hidden="true" />Daraga Public Cemetery (excluded)</li>
          <AlertLegendItems />
        </ul>
      </div>
    </div>
  );
}

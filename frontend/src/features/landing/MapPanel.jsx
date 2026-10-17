import { Suspense, lazy, useEffect, useRef, useState } from "react";
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
 * Right column of the hero: barangay map with the permanent flood-prone designation
 * and active alert areas as separate layers.
 */
export default function MapPanel({ live }) {
  const ref = useRef(null);
  const near = useNearViewport(ref);
  const alerts = live.alerts;

  const alertText = live.status !== "ready"
    ? ""
    : alerts.length
      ? ` Active alert areas are outlined: ${alerts.map((a) => `${a.severity} ${a.type.toLowerCase()} alert, ${areaLabel(a)}`).join("; ")}.`
      : " No active barangay alerts.";
  const label = `Map of Barangay Binitayan. Puroks 1 to 4 are shaded red as designated flood-prone zones, with the Daraga Public Cemetery excluded; Puroks 5A to 7 are not currently designated.${alertText} Use the zoom buttons to look closer.`;

  return (
    <div className="lp-hero-map" id="hazard-map" ref={ref}>
      <div className="lm-card">
        <div className="lp-map-frame" role="region" aria-label={label}>
          {near ? (
            <Suspense fallback={<div className="lp-map-skeleton" aria-hidden="true" />}>
              <BarangayMap alerts={alerts} />
            </Suspense>
          ) : (
            <div className="lp-map-skeleton" aria-hidden="true" />
          )}
        </div>
      </div>
    </div>
  );
}

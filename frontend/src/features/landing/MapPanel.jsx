import { Suspense, lazy, useEffect, useRef, useState } from "react";

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

/** Right column of the hero: the fixed flood-prone zone map, nothing else. */
export default function MapPanel({ hazard }) {
  const ref = useRef(null);
  const near = useNearViewport(ref);
  const incidents = hazard?.incidents || [];
  const label = `Map of Barangay Binitayan. Puroks 1 to 4 are shaded red as designated flood-prone zones, with the Daraga Public Cemetery excluded; Puroks 5A to 7 are not currently designated.${
    incidents.length
      ? ` ${incidents.length} active ${incidents.length === 1 ? "incident" : "incidents"}: ${incidents.map((i) => `${i.purok}, ${i.title}`).join("; ")}.`
      : " No active incidents."
  }`;

  return (
    <div className="lp-hero-map" id="hazard-map" ref={ref}>
      <div className="lm-card">
        <div className="lp-map-frame" role="img" aria-label={label}>
          {near ? (
            <Suspense fallback={<div className="lp-map-skeleton" aria-hidden="true" />}>
              <BarangayMap incidents={incidents} />
            </Suspense>
          ) : (
            <div className="lp-map-skeleton" aria-hidden="true" />
          )}
        </div>
      </div>
    </div>
  );
}

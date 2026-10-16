import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { CircleCheck, Siren } from "lucide-react";
import IconTile from "../../components/ui/IconTile.jsx";
import Skeleton from "../../components/ui/Skeleton.jsx";
import useMediaQuery from "../../hooks/useMediaQuery.js";

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

/** Top-left card: active incidents, one row per incident. */
export function FloatingIncidentsCard({ hazard, loading }) {
  if (loading || !hazard) {
    return (
      <div className="map-card map-card-incidents" aria-hidden="true">
        <Skeleton width={160} height={20} />
        <Skeleton width="100%" height={14} />
        <Skeleton width="80%" height={14} />
      </div>
    );
  }
  const n = hazard.incidents.length;
  return (
    <div className="map-card map-card-incidents">
      <div className="map-card-head">
        <IconTile icon={n ? Siren : CircleCheck} tone={n ? "red" : "green"} size="sm" />
        <p className="map-card-title">{n ? `${n} active ${n === 1 ? "incident" : "incidents"}` : "No active incidents"}</p>
      </div>
      {n > 0 && (
        <ul className="map-card-list" role="list">
          {hazard.incidents.slice(0, 4).map((i) => (
            <li key={i.id}>
              <span className="purok-chip-red">{i.purok}</span>
              <span className="map-card-row-text">{i.title}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Bottom-right card. Stock counts are not published (barangay decision), so
 * this shows HOW relief is tracked rather than how much is held.
 */
export function ReliefSummaryCard() {
  return (
    <div className="map-card map-card-relief">
      <p className="map-card-title">Relief supplies tracked</p>
      <ul className="map-card-list" role="list">
        <li><span className="dot dot-green" aria-hidden="true" />Recorded in the barangay inventory</li>
        <li><span className="dot dot-orange" aria-hidden="true" />Reserved for approved households</li>
        <li><span className="dot dot-navy" aria-hidden="true" />Handed over and logged</li>
      </ul>
    </div>
  );
}

/** Right column of the hero: the live barangay map with the two floating cards. */
export default function MapPanel({ hazard, loading }) {
  const ref = useRef(null);
  const near = useNearViewport(ref);
  // The cards float over the map only from 1280px, where the map is wide enough
  // for them not to cover any Purok; below that they sit under it (landing.css).
  const cardsOverlay = useMediaQuery("(min-width: 1280px)");
  const incidents = hazard?.incidents || [];
  const label = incidents.length
    ? `Map of Barangay Binitayan with ${incidents.length} active ${incidents.length === 1 ? "incident" : "incidents"}: ${incidents.map((i) => `${i.purok}, ${i.title}`).join("; ")}.`
    : "Map of Barangay Binitayan. No active incidents.";

  return (
    <div className="lp-hero-map" id="hazard-map" ref={ref}>
      <div className="lp-map-frame" role="region" aria-label={label}>
        {near ? (
          <Suspense fallback={<div className="lp-map-skeleton" aria-hidden="true" />}>
            <BarangayMap incidents={incidents} cardsOverlay={cardsOverlay} />
          </Suspense>
        ) : (
          <div className="lp-map-skeleton" aria-hidden="true" />
        )}
      </div>
      <FloatingIncidentsCard hazard={hazard} loading={loading} />
      <ReliefSummaryCard />
    </div>
  );
}

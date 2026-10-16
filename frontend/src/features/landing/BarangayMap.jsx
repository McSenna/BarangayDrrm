import { useMemo } from "react";
import { AttributionControl, GeoJSON, MapContainer, Marker, Polygon, TileLayer, Tooltip } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import boundary from "../../data/binitayanBoundary.json";
import { PUROK_BOUNDARIES } from "../../utils/purokBoundaries.js";
import { getGeoJsonBounds } from "../../utils/geoBounds.js";
import { purokKey } from "../../utils/purokLabel.js";
import { MAP_COLORS } from "../../theme/mapTokens.js";

const BOUNDS = getGeoJsonBounds(boundary);

/** All outer rings of the barangay boundary as Leaflet [lat, lng] arrays. */
function boundaryRings(fc) {
  const rings = [];
  fc.features.forEach((f) => {
    const g = f.geometry;
    const polys = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
    polys.forEach((p) => rings.push(p[0].map(([lng, lat]) => [lat, lng])));
  });
  return rings;
}
const RINGS = boundaryRings(boundary);
// A world-sized polygon with the barangay cut out: dims everything outside Binitayan.
const WORLD = [[89, -179], [89, 179], [-89, 179], [-89, -179]];
const MASK = [WORLD, ...RINGS];

/** Rough centre of a feature (mean of its outer ring), as [lat, lng]. */
function centreOf(feature) {
  const g = feature.geometry;
  const ring = g.type === "Polygon" ? g.coordinates[0] : g.type === "MultiPolygon" ? g.coordinates[0][0] : [];
  if (!ring.length) return null;
  const [sx, sy] = ring.reduce(([x, y], [lng, lat]) => [x + lng, y + lat], [0, 0]);
  return [sy / ring.length, sx / ring.length];
}
const PUROK_BY_KEY = new Map(PUROK_BOUNDARIES.items.map((it) => [it.name, it]));
const BARANGAY_CENTRE = BOUNDS ? [(BOUNDS[0][0] + BOUNDS[1][0]) / 2, (BOUNDS[0][1] + BOUNDS[1][1]) / 2] : [13.1555, 123.7162];

const pinIcon = L.divIcon({ className: "", html: '<span class="lm-pin" aria-hidden="true"></span>', iconSize: [26, 26], iconAnchor: [13, 24], tooltipAnchor: [0, -22] });
const labelIcon = L.divIcon({ className: "", html: '<span class="lm-centre-label">BINITAYAN<small>DARAGA, ALBAY</small></span>', iconSize: [140, 40], iconAnchor: [70, 20] });

const BOUNDARY_STYLE = { color: MAP_COLORS.boundary, weight: 3, dashArray: "8 6", fill: false, className: "lm-boundary" };
const ZONE_STYLE = { color: MAP_COLORS.hazard, weight: 1.5, fillColor: MAP_COLORS.hazard, fillOpacity: 0.22 };
const MASK_STYLE = { stroke: false, fillColor: MAP_COLORS.mask, fillOpacity: 0.95, interactive: false };

/**
 * Public hero map of Barangay Binitayan only: OpenStreetMap tiles (muted),
 * everything outside the boundary dimmed, affected Puroks shaded red, and a
 * pin per active incident at its Purok's centre (barangay-wide alerts at the
 * barangay centre). A static picture otherwise — no scroll/drag/zoom on the
 * landing page — but pins stay keyboard-focusable and labelled.
 */
export default function BarangayMap({ incidents = [], cardsOverlay = true }) {
  // When the floating cards sit on the map, keep the outline clear of the
  // bottom-right relief card (about 270 x 150 px) so no Purok is hidden.
  const fit = cardsOverlay
    ? { paddingTopLeft: [12, 12], paddingBottomRight: [12, 150] }
    : { padding: [10, 10] };
  const placed = useMemo(() => {
    const seen = new Map();
    return incidents.map((i) => {
      const it = i.purokRaw ? PUROK_BY_KEY.get(purokKey(i.purokRaw)) : null;
      const base = (it?.feature && centreOf(it.feature)) || BARANGAY_CENTRE;
      const k = base.join(",");
      const n = seen.get(k) || 0;
      seen.set(k, n + 1);
      // Several incidents in one Purok: fan the pins out slightly so each stays clickable.
      return { ...i, pos: [base[0] - n * 0.0006, base[1] + n * 0.0008], zone: it?.feature || null };
    });
  }, [incidents]);

  const zones = placed.filter((p) => p.zone);

  return (
    <div className="lm">
      <MapContainer
        key={cardsOverlay ? "overlay" : "stacked"} // refit when the layout changes
        bounds={BOUNDS}
        boundsOptions={fit}
        zoomSnap={0.25}
        scrollWheelZoom={false}
        dragging={false}
        doubleClickZoom={false}
        touchZoom={false}
        boxZoom={false}
        keyboard={false}
        zoomControl={false}
        attributionControl={false}
        className="lm-map"
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        />
        {/* No "Leaflet" prefix; the OpenStreetMap credit is required by OSM's tile licence. */}
        <AttributionControl position="bottomright" prefix={false} />
        <Polygon positions={MASK} pathOptions={MASK_STYLE} />
        {zones.map((z) => (
          <GeoJSON key={`zone-${z.id}`} data={z.zone} style={() => ZONE_STYLE} interactive={false} />
        ))}
        <GeoJSON data={boundary} style={() => BOUNDARY_STYLE} interactive={false} />
        <Marker position={BARANGAY_CENTRE} icon={labelIcon} interactive={false} keyboard={false} />
        {placed.map((p) => (
          <Marker key={p.id} position={p.pos} icon={pinIcon} title={`${p.purok} · ${p.title}`} alt={`${p.purok} · ${p.title}`} keyboard>
            <Tooltip permanent direction="top" className="lm-pin-label">{`${p.purok} · ${p.title}`}</Tooltip>
          </Marker>
        ))}
      </MapContainer>
      <span className="lm-north" aria-hidden="true">N</span>
    </div>
  );
}

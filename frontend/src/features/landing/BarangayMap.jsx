import { useEffect, useMemo } from "react";
import { AttributionControl, GeoJSON, MapContainer, Marker, Pane, TileLayer, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import boundary from "../../data/binitayanBoundary.json";
import { PUROK_BOUNDARIES } from "../../utils/purokBoundaries.js";
import { FLOOD_EXCLUSIONS, floodZoneShape } from "../../utils/floodZoneGeometry.js";
import { floodDesignation } from "../../config/floodZones.js";
import { getGeoJsonBounds } from "../../utils/geoBounds.js";
import { labelPoint } from "../../utils/polygonLabel.js";
import { purokKey } from "../../utils/purokLabel.js";
import { MAP_COLORS, ZONE_STYLES } from "../../theme/mapTokens.js";

/**
 * Public "Barangay Binitayan Flood-Prone Zone Map" on the Home page.
 *
 * Layers, bottom to top: OSM tiles, clipped to the PSA barangay boundary so
 * the map is the barangay silhouette on a transparent box (its soft shadow is
 * CSS on the silhouette pane, see .lm-silhouette) → Purok areas (Puroks 1–4 red = designated flood-prone,
 * drawn from the cut-out shapes in utils/floodZoneGeometry.js so the Daraga
 * Public Cemetery footprint is never red; other Puroks neutral) → excluded
 * area outline → barangay boundary → Purok labels → incident pins.
 *
 * A fixed picture of the whole barangay: no panning, zooming, controls or
 * popups. The view is re-fitted whenever the map's box changes size. No
 * household data is shown here: this page is public.
 */

const BOUNDS = L.latLngBounds(getGeoJsonBounds(boundary));
// Room around the silhouette for its shadow, so the box never clips it. The
// shadow falls mostly downward, so the sides and top need less than the bottom.
const FIT = { paddingTopLeft: [14, 14], paddingBottomRight: [14, 30], animate: false };
const Z = { silhouette: 200, zones: 410, excluded: 420, outline: 430, labels: 450 };

function outerRings(fc) {
  const rings = [];
  fc.features.forEach((f) => {
    const g = f.geometry;
    const polys = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
    polys.forEach((p) => rings.push(p[0].map(([lng, lat]) => [lat, lng])));
  });
  return rings;
}
const BARANGAY_RINGS = outerRings(boundary);
const BOUNDARY_STYLE = { color: MAP_COLORS.boundary, weight: 3, dashArray: "8 6", fill: false, className: "lm-boundary" };
const EXCLUDED_STYLE = { color: MAP_COLORS.boundary, weight: 1.5, opacity: 0.85, dashArray: "4 4", fillColor: MAP_COLORS.white, fillOpacity: 0.35, interactive: false };

/** Every validated Purok with the shape to draw, its designation and label point. */
const PUROKS = PUROK_BOUNDARIES.items
  .filter((it) => it.valid && it.feature?.geometry)
  .map((it) => {
    const designation = floodDesignation(it.name);
    const shape = designation === "flood_prone" ? floodZoneShape(it.name, it.feature) : { feature: it.feature, label: null, excluded: [] };
    return {
      name: it.name,
      short: it.name.replace(/^Purok\s+/, ""),
      designation,
      feature: shape.feature,
      excluded: shape.excluded,
      label: shape.label || labelPoint(it.feature.geometry.coordinates[0]),
    };
  });
const PUROK_BY_KEY = new Map(PUROKS.map((p) => [p.name, p]));
const BARANGAY_CENTRE = [BOUNDS.getCenter().lat, BOUNDS.getCenter().lng];

const labelIcon = (p) =>
  L.divIcon({
    className: "lm-label-icon",
    html: `<span class="lm-label lm-label--${p.designation === "flood_prone" ? "flood" : "neutral"}"><b class="lm-label-full">${p.name.toUpperCase()}</b><b class="lm-label-short">${p.short}</b></span>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
const LABEL_ICONS = new Map(PUROKS.map((p) => [p.name, labelIcon(p)]));
const excludedIcon = (name) =>
  L.divIcon({ className: "lm-label-icon", html: `<span class="lm-excluded-label">${name}</span>`, iconSize: [0, 0], iconAnchor: [0, 0] });
const pinIcon = L.divIcon({ className: "", html: '<span class="lm-pin" aria-hidden="true"></span>', iconSize: [26, 26], iconAnchor: [13, 24], tooltipAnchor: [0, -22] });

/** Rough centre of a feature (mean of its outer ring), as [lat, lng]. */
function centreOf(feature) {
  const g = feature.geometry;
  const ring = g.type === "Polygon" ? g.coordinates[0] : g.type === "MultiPolygon" ? g.coordinates[0][0] : [];
  if (!ring.length) return null;
  const [sx, sy] = ring.reduce(([x, y], [lng, lat]) => [x + lng, y + lat], [0, 0]);
  return [sy / ring.length, sx / ring.length];
}

/** The barangay outline as a CSS clip-path in the map's layer pixels. */
function silhouetteClip(map) {
  const d = BARANGAY_RINGS.map((ring) =>
    ring.map((ll, i) => {
      const p = map.latLngToLayerPoint(ll);
      return `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
    }).join(" ") + " Z"
  ).join(" ");
  return `path("${d}")`;
}

/**
 * Clips the lm-tiles pane to the barangay outline, re-computed whenever the
 * pixel origin can change. Rendered inside that pane, so it exists by now.
 */
function SilhouetteClip() {
  const map = useMap();
  useEffect(() => {
    const tiles = map.getPane("lm-tiles");
    const clip = () => { tiles.style.clipPath = silhouetteClip(map); };
    clip();
    map.on("viewreset zoomend moveend", clip);
    return () => map.off("viewreset zoomend moveend", clip);
  }, [map]);
  return null;
}

/** Fits the whole barangay into the map's box, again whenever the box resizes. */
function FixedView() {
  const map = useMap();
  useEffect(() => {
    const fit = () => map.fitBounds(BOUNDS, FIT);
    fit();
    map.on("resize", fit);
    return () => map.off("resize", fit);
  }, [map]);
  return null;
}

export default function BarangayMap({ incidents = [] }) {
  const placed = useMemo(() => {
    const seen = new Map();
    return incidents.map((i) => {
      const p = i.purokRaw ? PUROK_BY_KEY.get(purokKey(i.purokRaw)) : null;
      const base = (p && p.label) || (p && centreOf(p.feature)) || BARANGAY_CENTRE;
      const k = base.join(",");
      const n = seen.get(k) || 0;
      seen.set(k, n + 1);
      // Several incidents in one Purok: fan the pins out slightly so each stays clickable.
      return { ...i, pos: [base[0] - 0.00025 - n * 0.0006, base[1] + n * 0.0008] };
    });
  }, [incidents]);

  return (
    <div className="lm">
      <MapContainer
        bounds={BOUNDS}
        boundsOptions={FIT}
        maxZoom={19}
        zoomSnap={0}
        dragging={false}
        keyboard={false}
        boxZoom={false}
        scrollWheelZoom={false}
        doubleClickZoom={false}
        touchZoom={false}
        zoomControl={false}
        attributionControl={false}
        className="lm-map"
      >
        {/* Shadow on the outer pane, clip on the inner one: a filter and clip-path on one element would clip the shadow away. */}
        <Pane name="lm-silhouette" className="lm-silhouette" style={{ zIndex: Z.silhouette }}>
          <Pane name="lm-tiles" className="lm-tiles">
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              maxZoom={19}
            />
            <SilhouetteClip />
          </Pane>
        </Pane>
        {/* No "Leaflet" prefix; the OpenStreetMap credit covers the tiles and the cemetery outline (ODbL). */}
        <AttributionControl position="bottomright" prefix={false} />
        <FixedView />

        <Pane name="lm-zones" style={{ zIndex: Z.zones }}>
          {PUROKS.map((p) => (
            <GeoJSON key={`zone-${p.name}`} data={p.feature} style={() => ZONE_STYLES[p.designation] || ZONE_STYLES.not_designated} interactive={false} />
          ))}
        </Pane>

        <Pane name="lm-excluded" style={{ zIndex: Z.excluded }}>
          {FLOOD_EXCLUSIONS.map((e) => (
            <GeoJSON key={`excluded-${e.id}`} data={e.feature} style={() => EXCLUDED_STYLE} interactive={false} />
          ))}
        </Pane>

        <Pane name="lm-outline" style={{ zIndex: Z.outline }}>
          <GeoJSON data={boundary} style={() => BOUNDARY_STYLE} interactive={false} />
        </Pane>

        <Pane name="lm-labels" style={{ zIndex: Z.labels }}>
          {PUROKS.filter((p) => p.label).map((p) => (
            <Marker key={`label-${p.name}`} position={p.label} icon={LABEL_ICONS.get(p.name)} interactive={false} keyboard={false} />
          ))}
          {FLOOD_EXCLUSIONS.filter((e) => e.label).map((e) => (
            <Marker key={`label-${e.id}`} position={e.label} icon={excludedIcon(e.name)} interactive={false} keyboard={false} />
          ))}
        </Pane>

        {placed.map((p) => (
          <Marker key={p.id} position={p.pos} icon={pinIcon} title={`${p.purok} · ${p.title}`} alt="" keyboard={false}>
            <Tooltip direction="top" className="lm-pin-label">{`${p.purok} · ${p.title}`}</Tooltip>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}

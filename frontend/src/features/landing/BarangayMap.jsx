import { useEffect } from "react";
import { AttributionControl, GeoJSON, MapContainer, Marker, Pane, TileLayer, ZoomControl, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import boundary from "../../data/binitayanBoundary.json";
import { PUROK_BOUNDARIES } from "../../utils/purokBoundaries.js";
import { FLOOD_EXCLUSIONS, floodZoneShape } from "../../utils/floodZoneGeometry.js";
import { floodDesignation } from "../../config/floodZones.js";
import { getGeoJsonBounds } from "../../utils/geoBounds.js";
import { labelPoint } from "../../utils/polygonLabel.js";
import { MAP_COLORS, ZONE_STYLES } from "../../theme/mapTokens.js";
import AlertAreaLayer from "../alerts/AlertAreaLayer.jsx";

/**
 * Public "Barangay Binitayan Flood-Prone Zone Map" on the Home page.
 *
 * Layers, bottom to top: OSM tiles, clipped to the PSA barangay boundary so
 * the map is the barangay silhouette on a transparent box (its soft shadow is
 * CSS on the silhouette pane, see .lm-silhouette) → Purok areas (Puroks 1–4 red = designated flood-prone,
 * drawn from the cut-out shapes in utils/floodZoneGeometry.js so the Daraga
 * Public Cemetery footprint is never red; other Puroks neutral) → excluded
 * area outline → barangay boundary → ACTIVE ALERT AREAS (Phase 33, their own
 * pane, removed when an alert is turned off; the flood designation below is
 * permanent and never changes with alerts) → Purok labels.
 *
 * Locked to the barangay: no dragging or keyboard panning. Zoom (+/− buttons,
 * double-click, pinch) keeps the centre, the whole-barangay view is the
 * minimum zoom, and zooming fully out re-centres. The wheel scrolls the page,
 * not the map. No household data is shown here: this page is public.
 */

const BOUNDS = L.latLngBounds(getGeoJsonBounds(boundary));
// Room around the silhouette for its shadow, so the box never clips it. The
// shadow falls mostly downward, so the sides and top need less than the bottom.
const FIT = { paddingTopLeft: [14, 14], paddingBottomRight: [14, 30], animate: false };
const Z = { silhouette: 200, zones: 410, excluded: 420, outline: 430, alerts: 440, labels: 450 };
const MAX_ZOOM = 18;

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

/**
 * The whole barangay is the minimum zoom. Zooming keeps the centre (no pan); at the minimum the view is
 * re-fitted, so it always returns to the whole barangay. Re-fitted when the box resizes while zoomed out.
 */
function LockedView() {
  const map = useMap();
  useEffect(() => {
    const atMin = () => map.getZoom() <= map.getMinZoom() + 0.01;
    const fit = () => {
      map.setMinZoom(0);
      map.fitBounds(BOUNDS, FIT);
      map.setMinZoom(map.getZoom());
    };
    fit();
    const onZoomEnd = () => { if (atMin()) map.fitBounds(BOUNDS, FIT); };
    const onResize = () => {
      const zoom = map.getZoom();
      const wasMin = atMin();
      fit();
      if (!wasMin && zoom > map.getMinZoom()) map.setZoom(zoom, { animate: false });
    };
    map.on("zoomend", onZoomEnd);
    map.on("resize", onResize);
    return () => { map.off("zoomend", onZoomEnd); map.off("resize", onResize); };
  }, [map]);
  return null;
}

/** alerts: normalized active alerts (features/alerts/alertModel.js); selectedId: the alert to emphasise. */
export default function BarangayMap({ alerts = [], selectedId = null }) {
  return (
    <div className="lm">
      <MapContainer
        bounds={BOUNDS}
        boundsOptions={FIT}
        maxZoom={MAX_ZOOM}
        zoomSnap={0}
        zoomDelta={1}
        dragging={false}
        keyboard={false}
        boxZoom={false}
        scrollWheelZoom={false}
        doubleClickZoom="center"
        touchZoom="center"
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
        <LockedView />
        <ZoomControl position="topright" zoomInTitle="Zoom in" zoomOutTitle="Zoom out" />

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

        <AlertAreaLayer alerts={alerts} selectedId={selectedId} pane="lm-alerts" zIndex={Z.alerts} />

        <Pane name="lm-labels" style={{ zIndex: Z.labels }}>
          {PUROKS.filter((p) => p.label).map((p) => (
            <Marker key={`label-${p.name}`} position={p.label} icon={LABEL_ICONS.get(p.name)} interactive={false} keyboard={false} />
          ))}
          {FLOOD_EXCLUSIONS.filter((e) => e.label).map((e) => (
            <Marker key={`label-${e.id}`} position={e.label} icon={excludedIcon(e.name)} interactive={false} keyboard={false} />
          ))}
        </Pane>

      </MapContainer>
    </div>
  );
}

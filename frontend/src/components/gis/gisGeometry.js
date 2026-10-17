/**
 * Geometry prepared once for the GIS map: the Barangay Binitayan boundary
 * (PSA PSGC, src/data/binitayanBoundary.json), its outside mask, and the
 * validated candidate Purok polygons with their flood designation, label
 * point and bounds. Nothing here invents a shape: every ring comes from the
 * two GeoJSON files, and a Purok that fails validation is kept apart
 * (`unverifiedPuroks`) and never used to classify a point.
 */
import L from "leaflet";
import binitayanBoundary from "../../data/binitayanBoundary.json";
import { PUROK_BOUNDARIES } from "../../utils/purokBoundaries.js";
import { getGeoJsonBounds } from "../../utils/geoBounds.js";
import { isPointInGeoJson } from "../../utils/pointInPolygon.js";
import { labelPoint } from "../../utils/polygonLabel.js";
import { floodDesignation } from "../../config/floodZones.js";
import { FLOOD_EXCLUSIONS, floodZoneShape } from "../../utils/floodZoneGeometry.js";

export { binitayanBoundary };

export const BARANGAY_BOUNDS = L.latLngBounds(getGeoJsonBounds(binitayanBoundary));
// A little room around the boundary so the outline is never flush with the edge
// when zoomed in, but never enough to wander off to the neighbouring barangays.
export const MAX_BOUNDS = BARANGAY_BOUNDS.pad(0.06);
export const OVERVIEW_PADDING = L.point(32, 32);

function outerRings(fc) {
  const rings = [];
  (fc.features || [fc]).forEach((f) => {
    const g = f.geometry;
    const polys = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
    polys.forEach((p) => rings.push(p[0].map(([lng, lat]) => [lat, lng])));
  });
  return rings;
}
// A world-sized polygon with the barangay cut out: hides everything outside Binitayan.
const WORLD = [[89.9, -179.9], [89.9, 179.9], [-89.9, 179.9], [-89.9, -179.9]];
export const OUTSIDE_MASK = [WORLD, ...outerRings(binitayanBoundary)];

// `feature` is the Purok boundary (bounds, point lookups); `zoneFeature` is what
// the designation fill draws: for a flood-prone Purok, its shape with the
// excluded areas (Daraga Public Cemetery) cut out (utils/floodZoneGeometry.js).
export const PUROKS = PUROK_BOUNDARIES.items
  .filter((it) => it.valid && it.feature?.geometry)
  .map((it) => {
    const designation = floodDesignation(it.name);
    const zone = designation === "flood_prone" ? floodZoneShape(it.name, it.feature) : { feature: it.feature, label: null };
    return {
      name: it.name,
      short: it.name.replace(/^Purok\s+/, ""),
      feature: it.feature,
      zoneFeature: zone.feature,
      designation,
      label: zone.label || labelPoint(it.feature.geometry.coordinates[0]),
      bounds: L.latLngBounds(getGeoJsonBounds(it.feature)),
    };
  });

export { FLOOD_EXCLUSIONS };

export const unverifiedPuroks = PUROK_BOUNDARIES.items.filter((it) => !it.valid);

export const PUROK_BY_NAME = new Map(PUROKS.map((p) => [p.name, p]));

export function insideBarangay(lat, lng) {
  return isPointInGeoJson(lat, lng, binitayanBoundary);
}

/** Validated Puroks whose polygon contains the point (normally zero or one). */
export function puroksAt(lat, lng) {
  return PUROKS.filter((p) => isPointInGeoJson(lat, lng, p.feature)).map((p) => p.name);
}

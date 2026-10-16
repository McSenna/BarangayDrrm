/**
 * Phase 24 — candidate Purok boundaries for the map.
 *
 * Source: ../data/binitayan_purok_boundaries_candidate.geojson, built from the
 * coordinates the project team supplied (docs/purok_boundaries/). These are
 * CANDIDATE boundaries, kept separate from the barangay boundary
 * (binitayanBoundary.json), which is unchanged.
 *
 * GeoJSON positions are [longitude, latitude]; react-leaflet's <GeoJSON>
 * converts them itself, so the data is passed through unchanged.
 *
 * Each feature is checked here with the same rules as the PHP backend
 * (backend/lib/purok_boundaries.php): standard name, [lng, lat] order near
 * Binitayan, closed ring, >= 4 positions, no self-intersection. A feature that
 * fails is drawn only as a dashed outline (no fill) and is never treated as a
 * confirmed area.
 */
import purokGeojson from "../data/binitayan_purok_boundaries_candidate.geojson?raw";

export const STANDARD_PUROKS = ["Purok 1", "Purok 2", "Purok 3", "Purok 4", "Purok 5A", "Purok 5B", "Purok 6", "Purok 7"];

// Eight distinct, readable colours (also used for "colour households by Purok").
// Defined with the other map colours in src/theme/mapTokens.js.
export { PUROK_COLORS } from "../theme/mapTokens.js";

function orient(a, b, c) {
  const v = (b[1] - a[1]) * (c[0] - b[0]) - (b[0] - a[0]) * (c[1] - b[1]);
  return Math.abs(v) < 1e-18 ? 0 : v > 0 ? 1 : 2;
}
function onSeg(a, b, c) {
  return Math.min(a[0], c[0]) <= b[0] && b[0] <= Math.max(a[0], c[0]) && Math.min(a[1], c[1]) <= b[1] && b[1] <= Math.max(a[1], c[1]);
}
export function segmentsIntersect(p1, p2, p3, p4) {
  const o1 = orient(p1, p2, p3), o2 = orient(p1, p2, p4), o3 = orient(p3, p4, p1), o4 = orient(p3, p4, p2);
  if (o1 !== o2 && o3 !== o4) return true;
  return (o1 === 0 && onSeg(p1, p3, p2)) || (o2 === 0 && onSeg(p1, p4, p2)) || (o3 === 0 && onSeg(p3, p1, p4)) || (o4 === 0 && onSeg(p3, p2, p4));
}
/** True when no two non-adjacent edges of a closed ring touch or cross. */
export function ringIsSimple(ring) {
  const n = ring.length - 1;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue;
      if (segmentsIntersect(ring[i], ring[i + 1], ring[j], ring[j + 1])) return false;
    }
  }
  return true;
}

/** Validates one feature; returns { name, valid, problems, feature }. */
export function validatePurokFeature(f) {
  const problems = [];
  const name = f?.properties?.name || "";
  if (!STANDARD_PUROKS.includes(name)) problems.push(`"${name}" is not a standard Binitayan Purok`);
  const g = f?.geometry || {};
  const ring = g.type === "Polygon" ? g.coordinates?.[0] || [] : [];
  if (g.type !== "Polygon") problems.push("geometry is not a Polygon");
  if (ring.length < 4) problems.push("ring has fewer than 4 positions");
  const orderOk = ring.every((p) => Array.isArray(p) && p[0] > 120 && p[0] < 125 && p[1] > 12 && p[1] < 14.5);
  if (!orderOk) problems.push("coordinates are not [longitude, latitude] near Binitayan");
  const last = ring[ring.length - 1];
  const closed = ring.length >= 2 && ring[0][0] === last[0] && ring[0][1] === last[1];
  if (!closed) problems.push("ring is not closed");
  if (orderOk && closed && ring.length >= 4 && !ringIsSimple(ring)) problems.push("ring crosses itself (self-intersection)");
  return { name, valid: problems.length === 0, problems, feature: f };
}

export function parsePurokBoundaries(text) {
  const fc = JSON.parse(text);
  const items = (fc.features || []).map(validatePurokFeature);
  const missing = STANDARD_PUROKS.filter((p) => !items.some((i) => i.name === p));
  return { items, missing, status: fc.properties?.status || "candidate" };
}

export const PUROK_BOUNDARIES = parsePurokBoundaries(purokGeojson);

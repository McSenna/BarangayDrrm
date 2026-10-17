/**
 * Flood-prone overlay geometry with excluded areas cut out.
 *
 * Sources (all [longitude, latitude]):
 *   ../data/flood_exclusion_areas.geojson       areas excluded from the flood-prone overlay
 *                                              (Daraga Public Cemetery, OpenStreetMap way 158631584)
 *   ../data/binitayan_flood_zone_display.geojson DERIVED: designated Purok minus those areas,
 *                                              built by frontend/scripts/build_flood_zone_display.mjs
 *
 * The Purok boundaries (utils/purokBoundaries.js) and the barangay boundary
 * are not changed: the cut-out shape is used only to draw the red overlay.
 *
 * Everything is checked here before use. An exclusion area that fails the
 * same structural checks as a Purok is ignored. A derived shape is used only
 * when it is well-formed AND its fingerprints still match the current Purok
 * ring and exclusion rings; otherwise the plain Purok shape is drawn and a
 * console warning says the derived file needs rebuilding.
 */
import exclusionText from "../data/flood_exclusion_areas.geojson?raw";
import displayText from "../data/binitayan_flood_zone_display.geojson?raw";
import { PUROK_BOUNDARIES, ringIsSimple } from "./purokBoundaries.js";
import { FLOOD_PRONE_PUROKS } from "../config/floodZones.js";
import { labelPoint } from "./polygonLabel.js";

/** Same fingerprint as the build script: vertex count + coordinate sums. */
export const ringFingerprint = (ring) =>
  `${ring.length}:${ring.reduce((s, p) => s + p[0], 0).toFixed(7)}:${ring.reduce((s, p) => s + p[1], 0).toFixed(7)}`;

const nearBinitayan = (p) => Array.isArray(p) && p[0] > 120 && p[0] < 125 && p[1] > 12 && p[1] < 14.5;
const closed = (r) => r.length >= 4 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1];
const ringOk = (r) => Array.isArray(r) && closed(r) && r.every(nearBinitayan);

/* ---------- Exclusion areas ---------- */

export function validateExclusion(f) {
  const problems = [];
  const ring = f?.geometry?.type === "Polygon" ? f.geometry.coordinates?.[0] || [] : [];
  if (f?.geometry?.type !== "Polygon") problems.push("geometry is not a Polygon");
  if (!f?.properties?.id || !f?.properties?.name) problems.push("missing id or name");
  if (!ringOk(ring)) problems.push("ring is not a closed [longitude, latitude] ring near Binitayan");
  else if (!ringIsSimple(ring)) problems.push("ring crosses itself");
  return { valid: problems.length === 0, problems };
}

function parseExclusions(text) {
  return (JSON.parse(text).features || []).flatMap((f) => {
    const check = validateExclusion(f);
    if (!check.valid) {
      console.warn(`Flood exclusion area "${f?.properties?.name || "?"}" ignored: ${check.problems.join("; ")}`);
      return [];
    }
    const ring = f.geometry.coordinates[0];
    return [{ id: f.properties.id, name: f.properties.name, feature: f, label: labelPoint(ring), fingerprint: ringFingerprint(ring) }];
  });
}

export const FLOOD_EXCLUSIONS = parseExclusions(exclusionText);

/* ---------- Derived display shapes ---------- */

const polygonsOf = (g) => (g?.type === "Polygon" ? [g.coordinates] : g?.type === "MultiPolygon" ? g.coordinates : []);

/** Is a derived feature usable for this Purok right now? Returns { valid, problems }. */
export function validateDisplayFeature(f, purokRing, exclusions = FLOOD_EXCLUSIONS) {
  const problems = [];
  const p = f?.properties || {};
  if (!FLOOD_PRONE_PUROKS.includes(p.name)) problems.push(`"${p.name}" is not a designated flood-prone Purok`);
  const polys = polygonsOf(f?.geometry);
  if (!polys.length) problems.push("geometry is not a Polygon or MultiPolygon");
  if (!polys.every((poly) => poly.length && poly.every(ringOk))) problems.push("a ring is not a closed [longitude, latitude] ring near Binitayan");
  if (!purokRing || p.source_fingerprint !== ringFingerprint(purokRing)) problems.push("the Purok boundary changed since this shape was built");
  const current = new Map(exclusions.map((e) => [e.id, e.fingerprint]));
  for (const ex of p.excluded || []) {
    if (current.get(ex.id) !== ex.fingerprint) problems.push(`exclusion "${ex.name}" changed or is missing`);
  }
  return { valid: problems.length === 0, problems };
}

function parseDisplay(text) {
  const byName = new Map();
  for (const f of JSON.parse(text).features || []) {
    const item = PUROK_BOUNDARIES.items.find((it) => it.name === f?.properties?.name);
    const ring = item?.valid ? item.feature.geometry.coordinates[0] : null;
    const check = validateDisplayFeature(f, ring);
    if (!check.valid) {
      console.warn(`Flood-zone display shape for ${f?.properties?.name || "?"} not used (${check.problems.join("; ")}). ` +
        "Rebuild it with frontend/scripts/build_flood_zone_display.mjs.");
      continue;
    }
    // Label on the largest remaining part, so it never sits on an excluded area.
    const largest = polygonsOf(f.geometry).map((poly) => poly[0]).sort((a, b) => ringSpan(b) - ringSpan(a))[0];
    byName.set(f.properties.name, { feature: f, label: labelPoint(largest), excluded: f.properties.excluded || [] });
  }
  return byName;
}
function ringSpan(r) {
  let s = 0;
  for (let i = 0; i < r.length - 1; i++) s += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1];
  return Math.abs(s);
}

const DISPLAY = parseDisplay(displayText);

/**
 * The shape to draw for a Purok's flood-prone overlay: the validated cut-out
 * shape when one exists, otherwise the Purok's own feature. `label` and
 * `excluded` come along when the cut-out is used.
 */
export function floodZoneShape(name, purokFeature) {
  const d = DISPLAY.get(name);
  return d ? { feature: d.feature, label: d.label, excluded: d.excluded } : { feature: purokFeature, label: null, excluded: [] };
}

/** Names of the exclusion areas that were actually cut out of a given Purok's overlay. */
export const exclusionsCutFrom = (name) => (DISPLAY.get(name)?.excluded || []).map((e) => e.name);

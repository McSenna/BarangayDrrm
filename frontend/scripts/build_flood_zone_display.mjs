// Builds the flood-zone DISPLAY geometry: each designated flood-prone Purok
// minus the excluded areas (src/data/flood_exclusion_areas.geojson, e.g. the
// Daraga Public Cemetery footprint from OpenStreetMap).
//
//   output  src/data/binitayan_flood_zone_display.geojson   (only Puroks that overlap an exclusion)
//   copy    backend/data/flood_exclusion_areas.geojson      (byte-for-byte, for the PHP household check)
//
// The Purok boundaries and the barangay boundary are read, never written.
// Run this again whenever a Purok boundary or an exclusion area changes; the
// app compares fingerprints and falls back to the plain Purok shape (with a
// console warning) when the derived file is stale.
//
// Needs the polygon-clipping package only while building (not an app dependency):
//   cd frontend && npm i --no-save polygon-clipping@0.15.7 && node scripts/build_flood_zone_display.mjs
import { readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import polygonClipping from "polygon-clipping";

const root = process.argv[2] || fileURLToPath(new URL("../..", import.meta.url));
const frontendData = join(root, "frontend/src/data");
const read = (p) => JSON.parse(readFileSync(p, "utf8"));

const purokFc = read(join(frontendData, "binitayan_purok_boundaries_candidate.geojson"));
const exclusionFc = read(join(frontendData, "flood_exclusion_areas.geojson"));
const floodSrc = readFileSync(join(root, "frontend/src/config/floodZones.js"), "utf8");
const FLOOD_PRONE = JSON.parse(floodSrc.match(/FLOOD_PRONE_PUROKS\s*=\s*(\[[^\]]*\])/)[1]);

/** Same fingerprint as src/utils/floodZoneGeometry.js: vertex count + coordinate sums. */
export const ringFingerprint = (ring) =>
  `${ring.length}:${ring.reduce((s, p) => s + p[0], 0).toFixed(7)}:${ring.reduce((s, p) => s + p[1], 0).toFixed(7)}`;

// Square metres of [lng, lat] polygons (outer ring minus holes), local equirectangular scale.
const K = 111320 * Math.cos((13.156 * Math.PI) / 180) * 110540;
const ringArea = (r) => {
  let s = 0;
  for (let i = 0; i < r.length - 1; i++) s += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1];
  return Math.abs(s / 2) * K;
};
const multiArea = (mp) => mp.reduce((t, poly) => t + ringArea(poly[0]) - poly.slice(1).reduce((h, r) => h + ringArea(r), 0), 0);
const round = (mp) => mp.map((poly) => poly.map((ring) => ring.map(([x, y]) => [+x.toFixed(7), +y.toFixed(7)])));

const exclusions = exclusionFc.features.map((f) => {
  if (f.geometry?.type !== "Polygon") throw new Error(`${f.properties?.id}: exclusion must be a Polygon`);
  return { id: f.properties.id, name: f.properties.name, ring: f.geometry.coordinates[0] };
});

const features = [];
for (const name of FLOOD_PRONE) {
  const f = purokFc.features.find((x) => x.properties?.name === name);
  if (!f) throw new Error(`${name}: not in the Purok boundary file`);
  const outer = f.geometry.coordinates[0];
  let shape = [[outer]];
  const removed = [];
  for (const ex of exclusions) {
    const overlap = polygonClipping.intersection(shape, [[ex.ring]]);
    if (!overlap.length) continue;
    removed.push({ id: ex.id, name: ex.name, removed_area_m2: +multiArea(overlap).toFixed(1), fingerprint: ringFingerprint(ex.ring) });
    shape = polygonClipping.difference(shape, [[ex.ring]]);
  }
  if (!removed.length) continue;
  const display = round(shape);
  const original = ringArea(outer);
  const kept = multiArea(display);
  const cut = removed.reduce((s, r) => s + r.removed_area_m2, 0);
  // Self-check: what is kept plus what was cut must equal the original Purok.
  if (Math.abs(original - kept - cut) > 1) throw new Error(`${name}: areas do not add up (${original} vs ${kept} + ${cut})`);
  features.push({
    type: "Feature",
    properties: {
      name,
      designation: "flood_prone",
      role: "flood_zone_display",
      source_fingerprint: ringFingerprint(outer),
      excluded: removed,
      original_area_m2: +original.toFixed(1),
      display_area_m2: +kept.toFixed(1),
      method: "polygon difference (Purok polygon minus exclusion footprint), polygon-clipping 0.15.7, positions rounded to 7 decimals",
    },
    geometry: display.length === 1 ? { type: "Polygon", coordinates: display[0] } : { type: "MultiPolygon", coordinates: display },
  });
  console.log(`${name}: ${original.toFixed(1)} m² -> ${kept.toFixed(1)} m² (${display.length} part(s)); removed ${removed.map((r) => `${r.name} ${r.removed_area_m2} m²`).join(", ")}`);
}

const out = {
  type: "FeatureCollection",
  properties: {
    status: "DERIVED display geometry — do not edit by hand; rebuild with frontend/scripts/build_flood_zone_display.mjs",
    purpose: "Designated flood-prone Puroks with the areas in flood_exclusion_areas.geojson cut out. Used only to draw the red flood-prone overlay; Purok and barangay boundaries are unchanged.",
    coordinate_order: "[longitude, latitude] (GeoJSON / WGS84)",
    built_from: ["binitayan_purok_boundaries_candidate.geojson", "flood_exclusion_areas.geojson"],
  },
  features,
};
writeFileSync(join(frontendData, "binitayan_flood_zone_display.geojson"), JSON.stringify(out, null, 2) + "\n");
copyFileSync(join(frontendData, "flood_exclusion_areas.geojson"), join(root, "backend/data/flood_exclusion_areas.geojson"));
console.log(`Wrote ${features.length} display feature(s) and the backend copy of the exclusion areas.`);

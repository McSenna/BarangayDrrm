// Phase 24 — checks the frontend validator (frontend/src/utils/purokBoundaries.js)
// against the supplied file and synthetic cases, and that it agrees with the
// PHP backend. Usage: node tests/purok_boundaries_js_test.mjs
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
// fileURLToPath/pathToFileURL keep this working on Windows as well as Linux.
const root = fileURLToPath(new URL("..", import.meta.url));
const PHP = process.env.PHP_BIN || "php";
let src = readFileSync(join(root, "frontend/src/utils/purokBoundaries.js"), "utf8");
src = src.replace(/^import purokGeojson .*$/m, "const purokGeojson = globalThis.__PUROK_TEXT__;");
// Copy the module with its relative dependency (Purok colours live in theme/mapTokens.js).
const dir = mkdtempSync(join(tmpdir(), "pbjs"));
mkdirSync(join(dir, "utils"));
mkdirSync(join(dir, "theme"));
writeFileSync(join(dir, "utils", "pb.mjs"), src);
writeFileSync(join(dir, "theme", "mapTokens.js"), readFileSync(join(root, "frontend/src/theme/mapTokens.js"), "utf8"));
writeFileSync(join(dir, "package.json"), '{"type":"module"}');
const text = readFileSync(join(root, "frontend/src/data/binitayan_purok_boundaries_candidate.geojson"), "utf8");
globalThis.__PUROK_TEXT__ = text;
const m = await import(pathToFileURL(join(dir, "utils", "pb.mjs")).href);
let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) { pass++; console.log("PASS " + msg); } else { fail++; console.log("FAIL " + msg); } };

const { items, missing } = m.PUROK_BOUNDARIES;
ok(JSON.stringify(items.map((i) => i.name)) === JSON.stringify(m.STANDARD_PUROKS), "frontend loads all eight Puroks with correct names");
ok(missing.length === 0, "no Purok missing");
ok(items[0].valid && items[0].feature.properties.approved_edit, "frontend: Purok 1 valid after the approved end-vertex removal");
ok(items.every((i) => i.valid), "frontend: all eight Puroks (incl. 5A, 5B) valid");
ok(Object.keys(m.PUROK_COLORS).length === 8 && new Set(Object.values(m.PUROK_COLORS)).size === 8, "eight distinct Purok colours");
const sq = [[123.7156, 13.1556], [123.7164, 13.1556], [123.7164, 13.1564], [123.7156, 13.1564], [123.7156, 13.1556]];
const f = (name, ring) => ({ type: "Feature", properties: { name }, geometry: { type: "Polygon", coordinates: [ring] } });
ok(m.validatePurokFeature(f("Purok 3", sq)).valid, "simple square valid");
ok(!m.validatePurokFeature(f("Purok 3", [sq[0], sq[2], sq[1], sq[3], sq[0]])).valid, "bow-tie invalid");
ok(m.validatePurokFeature(f("Purok 3", sq.map(([a, b]) => [b, a]))).problems.includes("coordinates are not [longitude, latitude] near Binitayan"), "swapped order detected");
ok(m.validatePurokFeature(f("Purok 3", sq.slice(0, 4))).problems.includes("ring is not closed"), "unclosed ring detected");
ok(!m.validatePurokFeature(f("Purok 8", sq)).valid, "non-standard name rejected");
// agreement with PHP
const php = JSON.parse(execFileSync(PHP, ["-r", 'require "backend/lib/purok_boundaries.php"; $b=purok_boundaries_load(); echo json_encode(array_map(fn($f)=>[$f["name"],$f["valid"]], $b["features"]));'], { cwd: root }).toString());
ok(JSON.stringify(php) === JSON.stringify(items.map((i) => [i.name, i.valid])), "frontend and PHP backend give the same validity for every Purok");
// GIS map: the frontend flood-prone list (styling) must equal the backend one (classification).
const fz = readFileSync(join(root, "frontend/src/config/floodZones.js"), "utf8").match(/FLOOD_PRONE_PUROKS = (\[[^\]]*\])/);
const phpFlood = JSON.parse(execFileSync(PHP, ["-r", 'require "backend/lib/flood_zones.php"; echo json_encode(FLOOD_PRONE_PUROKS);'], { cwd: root }).toString());
ok(fz && JSON.stringify(JSON.parse(fz[1])) === JSON.stringify(phpFlood) && phpFlood.join() === "Purok 1,Purok 2,Purok 3,Purok 4",
  "flood-prone Puroks agree between frontend config and PHP (Puroks 1–4)");
const a = readFileSync(join(root, "backend/data/binitayan_purok_boundaries_candidate.geojson"), "utf8");
ok(a === text, "backend copy of the GeoJSON is identical to the frontend file");
console.log(`\nPUROK BOUNDARY JS TEST: ${pass}/${pass + fail} passed`);
globalThis.process.exit(fail ? 1 : 0);

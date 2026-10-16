/**
 * Central map settings for Barangay Binitayan.
 *
 * BARANGAY_CENTER / DEFAULT_ZOOM remain as the MapContainer's initial paint
 * (before the boundary GeoJSON is fitted) and as the fallback centerpoint used
 * by "Reset to Barangay" if the boundary ever fails to load. The map's real
 * framing comes from the actual Binitayan boundary polygon in
 * ../data/binitayanBoundary.json (see BOUNDARY_STYLE below and
 * BarangayMap.jsx's fitBounds behavior) — this constant is intentionally kept
 * close to, but does not need to exactly equal, the boundary's centroid.
 */

import { MAP_COLORS, PRIORITY_COLORS, PUROK_COLORS, PUROK_PALETTE } from "../theme/mapTokens.js";

export const BARANGAY_CENTER ={ lat: 13.1391, lng: 123.7438 };
export const DEFAULT_ZOOM = 15;

// Barangay boundary line + fill styling (react-leaflet <GeoJSON style={...} />)
export const BOUNDARY_STYLE = {
  color: MAP_COLORS.boundary,  // clear boundary line in the app's navy
  weight: 3,
  opacity: 0.9,
  fillColor: MAP_COLORS.boundary,
  fillOpacity: 0.08,       // subtle, transparent fill — surrounding OSM tiles stay fully visible
};

// Padding (px) applied when fitting the map to the boundary, so the outline
// isn't flush against the container edge.
export const BOUNDARY_FIT_PADDING = [24, 24];

// Priority level -> marker color (colours live in src/theme/mapTokens.js).
// "No report" / "Not Assessed" (Phase 22) share the neutral grey.
export const PRIORITY_COLOR = PRIORITY_COLORS;

// A small, repeating palette for "color by purok" mode. Cycles if there are more
// puroks than colors — fine for a basic map, since puroks are also labeled by name.
export { PUROK_PALETTE };

export function colorForPurok(purok, purokList) {
  // Phase 24: standard Puroks use the same colour as their boundary on the map.
  if (PUROK_COLORS[purok]) return PUROK_COLORS[purok];
  const index = purokList.indexOf(purok);
  if (index === -1) return MAP_COLORS.neutral;
  return PUROK_PALETTE[index % PUROK_PALETTE.length];
}

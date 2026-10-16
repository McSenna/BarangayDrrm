/**
 * Minimal, dependency-free point-in-polygon check (ray casting), used only to
 * show an informational "outside Barangay Binitayan" message for My Location
 * (Step 4). Supports Polygon and MultiPolygon GeoJSON geometries, which is all
 * the existing binitayanBoundary.json ever contains — no external geometry
 * library needed for this one check.
 */
function pointInRing(lat, lng, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [lngI, latI] = ring[i];
    const [lngJ, latJ] = ring[j];
    const intersects =
      latI > lat !== latJ > lat &&
      lng < ((lngJ - lngI) * (lat - latI)) / (latJ - latI) + lngI;
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointInPolygonCoords(lat, lng, polygonCoords) {
  // polygonCoords = [outerRing, hole1, hole2, ...]
  if (!pointInRing(lat, lng, polygonCoords[0])) return false;
  for (let h = 1; h < polygonCoords.length; h++) {
    if (pointInRing(lat, lng, polygonCoords[h])) return false; // inside a hole
  }
  return true;
}

/** Returns true if (lat, lng) falls inside any polygon in the given GeoJSON. */
export function isPointInGeoJson(lat, lng, geojson) {
  const features = geojson.type === "FeatureCollection" ? geojson.features : [geojson];
  for (const f of features) {
    const geom = f.geometry;
    if (geom.type === "Polygon") {
      if (pointInPolygonCoords(lat, lng, geom.coordinates)) return true;
    } else if (geom.type === "MultiPolygon") {
      for (const poly of geom.coordinates) {
        if (pointInPolygonCoords(lat, lng, poly)) return true;
      }
    }
  }
  return false;
}

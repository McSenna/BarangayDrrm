/**
 * Small, dependency-free helper to compute a Leaflet-style bounding box
 * ([[south, west], [north, east]]) from a GeoJSON Feature/FeatureCollection.
 * Used to auto-fit the map to the Barangay Binitayan boundary without
 * pulling in a full geometry library (e.g. turf) for one calculation.
 */
export function getGeoJsonBounds(geojson) {
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;

  const visit = (coords) => {
    if (typeof coords[0] === "number") {
      const [lng, lat] = coords;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
    } else {
      coords.forEach(visit);
    }
  };

  const features = geojson.type === "FeatureCollection" ? geojson.features : [geojson];
  features.forEach((f) => visit(f.geometry.coordinates));

  if (minLat === Infinity) return null;
  return [[minLat, minLng], [maxLat, maxLng]];
}

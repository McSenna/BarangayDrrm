<?php
/**
 * Backend-authoritative Barangay Binitayan boundary validation (Step 5).
 *
 * This is a PHP port of frontend/src/utils/pointInPolygon.js (Step 4) — the
 * SAME ray-casting algorithm, applied to a byte-for-byte copy of the SAME
 * Step 2 GeoJSON (backend/data/binitayanBoundary.json; see
 * backend/data/BOUNDARY_SYNC_NOTE.md). No new/estimated/rectangular
 * boundary is introduced here.
 *
 * Frontend validation (Households.jsx) is for user feedback only. This file
 * is what actually protects the database: add_household.php and
 * update_household.php must call validate_household_coordinates() before
 * any INSERT/UPDATE and must not trust coordinates sent by React.
 */

/** Loads and caches the backend's copy of the Binitayan boundary GeoJSON. */
function load_binitayan_boundary()
{
    static $geojson = null;
    if ($geojson === null) {
        $path = __DIR__ . '/../data/binitayanBoundary.json';
        $raw = file_get_contents($path);
        $geojson = json_decode($raw, true);
    }
    return $geojson;
}

/** Ray-casting point-in-ring test — mirrors pointInPolygon.js's pointInRing(). */
function point_in_ring($lat, $lng, $ring)
{
    $inside = false;
    $n = count($ring);
    for ($i = 0, $j = $n - 1; $i < $n; $j = $i++) {
        $lngI = $ring[$i][0];
        $latI = $ring[$i][1];
        $lngJ = $ring[$j][0];
        $latJ = $ring[$j][1];

        $intersects = (($latI > $lat) !== ($latJ > $lat)) &&
            ($lng < ($lngJ - $lngI) * ($lat - $latI) / ($latJ - $latI) + $lngI);

        if ($intersects) {
            $inside = !$inside;
        }
    }
    return $inside;
}

/** Mirrors pointInPolygon.js's pointInPolygonCoords() — outer ring + holes. */
function point_in_polygon_coords($lat, $lng, $polygonCoords)
{
    if (!point_in_ring($lat, $lng, $polygonCoords[0])) {
        return false;
    }
    for ($h = 1; $h < count($polygonCoords); $h++) {
        if (point_in_ring($lat, $lng, $polygonCoords[$h])) {
            return false; // inside a hole
        }
    }
    return true;
}

/**
 * Mirrors pointInPolygon.js's isPointInGeoJson() — supports Polygon and
 * MultiPolygon geometries, wrapped in a Feature or FeatureCollection.
 */
function is_point_in_geojson($lat, $lng, $geojson)
{
    $features = ($geojson['type'] === 'FeatureCollection') ? $geojson['features'] : [$geojson];
    foreach ($features as $f) {
        $geom = $f['geometry'];
        if ($geom['type'] === 'Polygon') {
            if (point_in_polygon_coords($lat, $lng, $geom['coordinates'])) {
                return true;
            }
        } elseif ($geom['type'] === 'MultiPolygon') {
            foreach ($geom['coordinates'] as $poly) {
                if (point_in_polygon_coords($lat, $lng, $poly)) {
                    return true;
                }
            }
        }
    }
    return false;
}

/**
 * Authoritative server-side validation for a submitted household coordinate.
 *
 * @param mixed $latitude  raw value as received from the request (may be
 *                          null, '', a string, or a number)
 * @param mixed $longitude same as above
 * @return array{valid: bool, message: ?string} valid=true means either the
 *         coordinate is null/blank (allowed — coordinates remain optional,
 *         same as before this step) or it is a real number inside
 *         Barangay Binitayan. valid=false carries the exact rejection
 *         message to return to the client.
 */
function validate_household_coordinates($latitude, $longitude)
{
    $latProvided = $latitude !== null && $latitude !== '';
    $lngProvided = $longitude !== null && $longitude !== '';

    // Preserve existing behavior: coordinates are optional. If both are
    // blank/null, that's unchanged — do not force every household to have
    // coordinates.
    if (!$latProvided && !$lngProvided) {
        return ['valid' => true, 'message' => null];
    }

    // One provided without the other is not a valid pair.
    if ($latProvided !== $lngProvided) {
        return ['valid' => false, 'message' => 'Please enter both latitude and longitude, or leave both blank.'];
    }

    // Must be valid numeric coordinates.
    if (!is_numeric($latitude) || !is_numeric($longitude)) {
        return ['valid' => false, 'message' => 'Latitude and longitude must be numbers in decimal format (for example, 13.1545).'];
    }

    $lat = floatval($latitude);
    $lng = floatval($longitude);

    // Reasonable latitude/longitude ranges.
    if ($lat < -90 || $lat > 90 || $lng < -180 || $lng > 180) {
        return ['valid' => false, 'message' => 'Latitude must be between -90 and 90, and longitude between -180 and 180. Please check the values.'];
    }

    // Authoritative check against the actual Binitayan GeoJSON boundary.
    $geojson = load_binitayan_boundary();
    if (!is_point_in_geojson($lat, $lng, $geojson)) {
        return ['valid' => false, 'message' => 'The coordinates entered are outside Barangay Binitayan. Please check the latitude and longitude.'];
    }

    return ['valid' => true, 'message' => null];
}

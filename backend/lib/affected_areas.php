<?php
/**
 * Phase 20 — Administrator-recorded affected/flood areas.
 *
 * The system does NOT predict or generate affected areas. An Administrator
 * records the polygon (drawn on the map or pasted as GeoJSON). This file:
 *   1. validates and normalizes that GeoJSON (server-side; the browser is not trusted)
 *   2. identifies the households whose STORED coordinates fall inside it
 *      (point-in-polygon, the same ray-casting code as the boundary validator)
 *
 * Households without coordinates are never placed inside or outside an area;
 * they are listed separately as "missing coordinates".
 */

require_once __DIR__ . '/../utils/boundary_validator.php';

const AREA_MAX_VERTICES = 500;
const AREA_BBOX_MARGIN = 0.003; // degrees (~330 m) around the Binitayan boundary
const AREA_HAZARD_TYPES = ['Flood', 'Typhoon', 'Landslide', 'General Emergency'];

/** Bounding box of the Binitayan boundary: [minLng, minLat, maxLng, maxLat]. */
function binitayan_bbox(): array
{
    static $bbox = null;
    if ($bbox === null) {
        $minLng = $minLat = INF;
        $maxLng = $maxLat = -INF;
        $walk = function ($c) use (&$walk, &$minLng, &$minLat, &$maxLng, &$maxLat) {
            if (is_array($c) && count($c) >= 2 && is_numeric($c[0]) && is_numeric($c[1]) && !is_array($c[0])) {
                $minLng = min($minLng, $c[0]); $maxLng = max($maxLng, $c[0]);
                $minLat = min($minLat, $c[1]); $maxLat = max($maxLat, $c[1]);
                return;
            }
            if (is_array($c)) foreach ($c as $x) $walk($x);
        };
        foreach (load_binitayan_boundary()['features'] as $f) $walk($f['geometry']['coordinates']);
        $bbox = [$minLng, $minLat, $maxLng, $maxLat];
    }
    return $bbox;
}

/** Do segments p1-p2 and p3-p4 properly intersect? (points are [x, y]) */
function area_segments_cross(array $p1, array $p2, array $p3, array $p4): bool
{
    $d = function ($a, $b, $c) { return ($b[0] - $a[0]) * ($c[1] - $a[1]) - ($b[1] - $a[1]) * ($c[0] - $a[0]); };
    $d1 = $d($p3, $p4, $p1); $d2 = $d($p3, $p4, $p2);
    $d3 = $d($p1, $p2, $p3); $d4 = $d($p1, $p2, $p4);
    return (($d1 > 0 && $d2 < 0) || ($d1 < 0 && $d2 > 0)) && (($d3 > 0 && $d4 < 0) || ($d3 < 0 && $d4 > 0));
}

/** True if a closed ring (first point == last point) crosses itself. */
function area_ring_self_intersects(array $ring): bool
{
    $n = count($ring) - 1; // number of edges
    for ($i = 0; $i < $n; $i++) {
        for ($j = $i + 1; $j < $n; $j++) {
            if ($j === $i + 1 || ($i === 0 && $j === $n - 1)) continue; // adjacent edges share a point
            if (area_segments_cross($ring[$i], $ring[$i + 1], $ring[$j], $ring[$j + 1])) return true;
        }
    }
    return false;
}

/**
 * Validate and normalize one ring: numeric [lng, lat] pairs, rounded to 7
 * decimals, consecutive duplicates removed, closed, at least 3 distinct points,
 * inside the Binitayan area bounding box, not self-intersecting.
 * @return array [ring|null, error|null]
 */
function area_normalize_ring($ring, array $bbox, int &$vertexTotal): array
{
    if (!is_array($ring)) return [null, 'Each polygon ring must be a list of [longitude, latitude] points.'];
    $out = [];
    foreach ($ring as $pt) {
        if (!is_array($pt) || count($pt) < 2 || !is_numeric($pt[0]) || !is_numeric($pt[1])
            || is_array($pt[0]) || is_array($pt[1])) {
            return [null, 'Every point must be a pair of numbers: [longitude, latitude].'];
        }
        $lng = round(floatval($pt[0]), 7);
        $lat = round(floatval($pt[1]), 7);
        if (!is_finite($lng) || !is_finite($lat) || $lat < -90 || $lat > 90 || $lng < -180 || $lng > 180) {
            return [null, 'A point has an invalid latitude or longitude.'];
        }
        if ($lng < $bbox[0] - AREA_BBOX_MARGIN || $lng > $bbox[2] + AREA_BBOX_MARGIN
            || $lat < $bbox[1] - AREA_BBOX_MARGIN || $lat > $bbox[3] + AREA_BBOX_MARGIN) {
            return [null, 'The area must be drawn in and around Barangay Binitayan. A point is too far outside the barangay.'];
        }
        $last = end($out);
        if ($last && $last[0] === $lng && $last[1] === $lat) continue; // drop repeated point
        $out[] = [$lng, $lat];
    }
    if (count($out) > 1 && $out[0] === $out[count($out) - 1]) array_pop($out); // open it, then close once below
    $distinct = count(array_unique(array_map(fn($p) => $p[0] . ',' . $p[1], $out)));
    if ($distinct < 3) return [null, 'An area needs at least 3 different points.'];
    $vertexTotal += count($out);
    if ($vertexTotal > AREA_MAX_VERTICES) return [null, 'The area has too many points (maximum ' . AREA_MAX_VERTICES . ').'];
    $out[] = $out[0];
    if (area_ring_self_intersects($out)) return [null, 'The area outline crosses itself. Please draw the points in order around the area.'];
    return [$out, null];
}

/**
 * Validate an affected-area GeoJSON (string or decoded array). Accepts a
 * Polygon / MultiPolygon geometry, a Feature with one, or a FeatureCollection
 * of Polygon features (merged into a MultiPolygon).
 * @return array ['ok' => bool, 'geometry' => array|null, 'vertex_count' => int, 'message' => string|null]
 */
function validate_area_geojson($input): array
{
    $fail = fn($m) => ['ok' => false, 'geometry' => null, 'vertex_count' => 0, 'message' => $m];
    if (is_string($input)) {
        if (strlen($input) > 200000) return $fail('The GeoJSON is too large.');
        $input = json_decode($input, true);
    }
    if (!is_array($input) || !isset($input['type'])) return $fail('Please provide the area as GeoJSON (a Polygon).');

    $polygons = [];
    $collect = function ($geom) use (&$polygons) {
        if (!is_array($geom) || !isset($geom['type'], $geom['coordinates'])) return false;
        if ($geom['type'] === 'Polygon') { $polygons[] = $geom['coordinates']; return true; }
        if ($geom['type'] === 'MultiPolygon' && is_array($geom['coordinates'])) {
            foreach ($geom['coordinates'] as $p) $polygons[] = $p;
            return true;
        }
        return false;
    };
    if ($input['type'] === 'FeatureCollection') {
        if (empty($input['features']) || !is_array($input['features'])) return $fail('The FeatureCollection has no features.');
        foreach ($input['features'] as $f) {
            if (!$collect($f['geometry'] ?? null)) return $fail('Only Polygon or MultiPolygon areas are accepted.');
        }
    } elseif ($input['type'] === 'Feature') {
        if (!$collect($input['geometry'] ?? null)) return $fail('Only Polygon or MultiPolygon areas are accepted.');
    } elseif (!$collect($input)) {
        return $fail('Only Polygon or MultiPolygon areas are accepted.');
    }
    if (empty($polygons) || count($polygons) > 20) return $fail('Please provide between 1 and 20 polygons.');

    $bbox = binitayan_bbox();
    $vertexTotal = 0;
    $normalized = [];
    foreach ($polygons as $poly) {
        if (!is_array($poly) || empty($poly)) return $fail('A polygon has no outline.');
        $rings = [];
        foreach ($poly as $ring) {
            [$r, $err] = area_normalize_ring($ring, $bbox, $vertexTotal);
            if ($err) return $fail($err);
            $rings[] = $r;
        }
        $normalized[] = $rings;
    }

    // The area must actually overlap Barangay Binitayan.
    $boundary = load_binitayan_boundary();
    $overlaps = false;
    foreach ($normalized as $rings) {
        foreach ($rings[0] as $pt) {
            if (is_point_in_geojson($pt[1], $pt[0], $boundary)) { $overlaps = true; break 2; }
        }
    }
    if (!$overlaps) {
        foreach ($boundary['features'] as $f) {
            $g = $f['geometry'];
            $bpolys = $g['type'] === 'Polygon' ? [$g['coordinates']] : $g['coordinates'];
            foreach ($bpolys as $bp) foreach ($bp[0] as $bpt) {
                foreach ($normalized as $rings) {
                    if (point_in_polygon_coords($bpt[1], $bpt[0], $rings)) { $overlaps = true; break 4; }
                }
            }
        }
    }
    if (!$overlaps) return $fail('The area does not overlap Barangay Binitayan.');

    $geometry = count($normalized) === 1
        ? ['type' => 'Polygon', 'coordinates' => $normalized[0]]
        : ['type' => 'MultiPolygon', 'coordinates' => $normalized];
    return ['ok' => true, 'geometry' => $geometry, 'vertex_count' => $vertexTotal, 'message' => null];
}

/** Point-in-polygon for a normalized Polygon / MultiPolygon geometry. */
function area_contains_point(array $geometry, float $lat, float $lng): bool
{
    $polys = $geometry['type'] === 'Polygon' ? [$geometry['coordinates']] : $geometry['coordinates'];
    foreach ($polys as $rings) {
        if (point_in_polygon_coords($lat, $lng, $rings)) return true;
    }
    return false;
}

/**
 * Identify households inside the given areas, using the coordinates stored in
 * the database (never coordinates sent by the browser).
 *
 * @param array $areas rows from disaster_affected_areas (with 'geojson')
 * @return array ['inside' => [...], 'outside' => [...], 'missing' => [...], 'by_area' => [area_id => count]]
 */
function affected_households_for_areas(PDO $conn, array $areas): array
{
    require_once __DIR__ . '/field_scope.php';
    $geoms = [];
    foreach ($areas as $a) {
        $g = json_decode($a['geojson'], true);
        if (is_array($g) && in_array($g['type'] ?? '', ['Polygon', 'MultiPolygon'], true)) {
            $geoms[intval($a['area_id'])] = ['geometry' => $g, 'name' => $a['area_name'], 'hazard_type' => $a['hazard_type'],
                'area_type' => $a['area_type'] ?? AREA_TYPE_AFFECTED];
        }
    }
    $rows = $conn->query(
        "SELECT household_id, head_of_family, purok, address, number_of_members, vulnerable_members,
                children_count, seniors_count, pwd_count, pregnant_count, medical_needs_count, other_vulnerable_count,
                latitude, longitude
         FROM households ORDER BY household_id"
    )->fetchAll(PDO::FETCH_ASSOC);

    $rows = field_scope_rows($conn, $rows);
    $out = ['inside' => [], 'outside' => [], 'missing' => [], 'by_area' => array_fill_keys(array_keys($geoms), 0)];
    foreach ($rows as $h) {
        $base = [
            'household_id' => intval($h['household_id']),
            'head_of_family' => $h['head_of_family'],
            'purok' => $h['purok'],
            'address' => $h['address'],
            'number_of_members' => intval($h['number_of_members']),
            'vulnerable_members' => intval($h['vulnerable_members']),
        ];
        if ($h['latitude'] === null || $h['longitude'] === null || $h['latitude'] === '' || $h['longitude'] === '') {
            $out['missing'][] = $base;
            continue;
        }
        $lat = floatval($h['latitude']);
        $lng = floatval($h['longitude']);
        $base['latitude'] = $lat;
        $base['longitude'] = $lng;
        $hits = [];
        foreach ($geoms as $id => $g) {
            if (area_contains_point($g['geometry'], $lat, $lng)) {
                $hits[] = ['area_id' => $id, 'area_name' => $g['name'], 'hazard_type' => $g['hazard_type'], 'area_type' => $g['area_type']];
                $out['by_area'][$id]++;
            }
        }
        if ($hits) {
            $base['areas'] = $hits;
            $base['vulnerable_breakdown'] = [
                'children' => intval($h['children_count']), 'seniors' => intval($h['seniors_count']),
                'pwd' => intval($h['pwd_count']), 'pregnant' => intval($h['pregnant_count']),
                'medical' => intval($h['medical_needs_count']), 'other' => intval($h['other_vulnerable_count']),
            ];
            $out['inside'][] = $base;
        } else {
            $out['outside'][] = $base;
        }
    }
    return $out;
}

/**
 * Extra read-only details for households (latest non-rejected report and its
 * damage assessment, latest relief request, allocation counts).
 * @return array household_id => details
 */
function affected_household_details(PDO $conn, array $household_ids): array
{
    $ids = array_values(array_unique(array_map('intval', $household_ids)));
    if (!$ids) return [];
    $ph = implode(',', array_fill(0, count($ids), '?'));
    $details = array_fill_keys($ids, ['report' => null, 'damage' => null, 'request' => null, 'allocations' => ['Pending' => 0, 'Approved' => 0, 'Distributed' => 0]]);

    $rep = $conn->prepare(
        "SELECT dr.household_id, dr.report_id, dr.disaster_type, dr.severity, dr.status, dr.report_date,
                da.house_damage, da.infrastructure_damage, da.property_damage, da.agricultural_damage
         FROM disaster_reports dr LEFT JOIN damage_assessments da ON da.report_id = dr.report_id
         WHERE dr.household_id IN ($ph) AND dr.status <> 'Rejected'
         ORDER BY dr.created_at DESC, dr.report_id DESC"
    );
    $rep->execute($ids);
    foreach ($rep->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $hid = intval($r['household_id']);
        if ($details[$hid]['report'] !== null) continue; // newest only
        $details[$hid]['report'] = ['report_id' => intval($r['report_id']), 'disaster_type' => $r['disaster_type'], 'severity' => $r['severity'], 'status' => $r['status'], 'report_date' => $r['report_date']];
        if ($r['house_damage'] !== null) {
            $details[$hid]['damage'] = ['house' => $r['house_damage'], 'infrastructure' => $r['infrastructure_damage'], 'property' => $r['property_damage'], 'agricultural' => $r['agricultural_damage']];
        }
    }

    $req = $conn->prepare("SELECT household_id, request_id, status, urgency FROM relief_requests WHERE household_id IN ($ph) ORDER BY created_at DESC, request_id DESC");
    $req->execute($ids);
    foreach ($req->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $hid = intval($r['household_id']);
        if ($details[$hid]['request'] === null) $details[$hid]['request'] = ['request_id' => intval($r['request_id']), 'status' => $r['status'], 'urgency' => $r['urgency']];
    }

    // Workflow rounds by status label (Pending Assessment … Completed); historical per-item rows as "Distributed (historical)".
    $al = $conn->prepare("SELECT household_id, CASE status WHEN 'PENDING_ASSESSMENT' THEN 'Pending Assessment' WHEN 'ASSESSMENT_IN_PROGRESS' THEN 'Assessment in Progress'
                            WHEN 'READY_FOR_DISTRIBUTION' THEN 'Ready for Distribution' WHEN 'COMPLETED' THEN 'Completed' ELSE 'Cancelled' END AS status, COUNT(*) AS c
                          FROM household_allocations WHERE household_id IN ($ph) GROUP BY household_id, status
                          UNION ALL
                          SELECT household_id, 'Distributed (historical)', COUNT(*) FROM relief_allocations WHERE status = 'Distributed' AND household_id IN ($ph) GROUP BY household_id");
    $al->execute(array_merge($ids, $ids));
    foreach ($al->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $details[intval($r['household_id'])]['allocations'][$r['status']] = intval($r['c']);
    }
    return $details;
}

/** Fetch area rows by filter. $status: 'Active' | 'Resolved' | 'all'. */
function fetch_affected_areas(PDO $conn, ?int $event_id, ?int $area_id, string $status = 'Active', ?string $area_type = null): array
{
    // Phase 23: LEFT JOIN — a Flood-Prone Zone has no event.
    $sql = "SELECT a.*, e.event_name, e.disaster_type AS event_disaster_type, e.status AS event_status,
                   cu.full_name AS created_by_name
            FROM disaster_affected_areas a
            LEFT JOIN disaster_events e ON e.event_id = a.event_id
            LEFT JOIN users cu ON cu.user_id = a.created_by
            WHERE 1=1";
    $params = [];
    if ($event_id) { $sql .= " AND a.event_id = :event_id"; $params[':event_id'] = $event_id; }
    if ($area_id) { $sql .= " AND a.area_id = :area_id"; $params[':area_id'] = $area_id; }
    if (in_array($status, ['Active', 'Resolved'], true)) { $sql .= " AND a.status = :status"; $params[':status'] = $status; }
    if ($area_type !== null && in_array($area_type, AREA_TYPES, true) && areas_have_type_column($conn)) {
        $sql .= " AND a.area_type = :area_type";
        $params[':area_type'] = $area_type;
    }
    $sql .= " ORDER BY a.status ASC, a.created_at DESC, a.area_id DESC";
    $stmt = $conn->prepare($sql);
    $stmt->execute($params);
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

/**
 * Phase 23 — two kinds of mapped area:
 *   Recorded Affected Area — an area actually affected in a disaster event (Phase 20 meaning);
 *   Flood-Prone Zone       — reference geography that is prone to flooding; NOT active flooding.
 */
const AREA_TYPE_AFFECTED = 'Recorded Affected Area';
const AREA_TYPE_FLOOD_PRONE = 'Flood-Prone Zone';
const AREA_TYPES = [AREA_TYPE_AFFECTED, AREA_TYPE_FLOOD_PRONE];

function areas_have_type_column(PDO $conn): bool
{
    static $cache = null;
    if ($cache === null) {
        try { $cache = (bool) $conn->query("SHOW COLUMNS FROM disaster_affected_areas LIKE 'area_type'")->fetch(); }
        catch (Throwable $e) { $cache = false; }
    }
    return $cache;
}

/** Strict positive integer from request input (rejects "5abc", "2.5", arrays). */
function input_positive_int($raw): int
{
    if (is_int($raw)) return $raw > 0 ? $raw : 0;
    if (is_string($raw) && preg_match('/^\s*\d+\s*$/', $raw)) return max(0, intval($raw));
    return 0;
}

/** True when the Phase 20 tables exist (clear error instead of a 500 if the migration was not run). */
function phase20_tables_ready(PDO $conn): bool
{
    try {
        return (bool) $conn->query("SHOW TABLES LIKE 'disaster_affected_areas'")->fetch()
            && (bool) $conn->query("SHOW TABLES LIKE 'disaster_events'")->fetch();
    } catch (Throwable $e) {
        return false;
    }
}

function phase20_require_tables(PDO $conn): void
{
    if (!phase20_tables_ready($conn)) {
        http_response_code(503);
        echo json_encode(["success" => false, "message" => "This feature needs the Phase 20 database update. Please run database/migration_phase20_automation.sql."]);
        exit();
    }
}

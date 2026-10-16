<?php
/**
 * Phase 20 — automated affected-household identification.
 *
 * For the selected recorded areas (default: all Active areas; or ?event_id= /
 * ?area_id= / ?status=all), every household with STORED coordinates is tested
 * with point-in-polygon on the server. Households without coordinates are
 * listed separately and are never counted inside or outside.
 *
 * Read-only. Uses the existing DSS output (dss_priority_by_household) for the
 * priority shown with each household — nothing is recalculated, and being
 * inside an area does NOT change the priority score.
 */
require_once __DIR__ . '/../../config/cors.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../lib/affected_areas.php';
require_once __DIR__ . '/../../lib/requests.php';

require_login(['admin', 'relief_personnel']);
$conn = (new Database())->connect();
phase20_require_tables($conn);

$event_id = isset($_GET['event_id']) ? input_positive_int($_GET['event_id']) : 0;
$area_id = isset($_GET['area_id']) ? input_positive_int($_GET['area_id']) : 0;
$status = is_string($_GET['status'] ?? null) ? $_GET['status'] : 'Active';
if (!in_array($status, ['Active', 'Resolved', 'all'], true)) $status = 'Active';

$type = isset($_GET['area_type']) && is_string($_GET['area_type']) ? $_GET['area_type'] : null;
$areas = fetch_affected_areas($conn, $event_id ?: null, $area_id ?: null, $status, $type);
$res = affected_households_for_areas($conn, $areas);

$priority = dss_priority_by_household();
$details = affected_household_details($conn, array_column($res['inside'], 'household_id'));
foreach ($res['inside'] as &$h) {
    $p = $priority[$h['household_id']] ?? null;
    $h['priority_score'] = $p['priority_score'] ?? null;
    $h['priority_level'] = $p['priority_level'] ?? null;
    $h += $details[$h['household_id']] ?? [];
}
unset($h);
foreach ($res['outside'] as &$h) {
    $p = $priority[$h['household_id']] ?? null;
    $h['priority_score'] = $p['priority_score'] ?? null;
    $h['priority_level'] = $p['priority_level'] ?? null;
}
unset($h);

$area_out = [];
foreach ($areas as $a) {
    $area_out[] = [
        'area_id' => intval($a['area_id']), 'event_id' => $a['event_id'] === null ? null : intval($a['event_id']), 'event_name' => $a['event_name'],
        'area_type' => $a['area_type'] ?? AREA_TYPE_AFFECTED,
        'hazard_type' => $a['hazard_type'], 'area_name' => $a['area_name'], 'description' => $a['description'],
        'status' => $a['status'], 'created_at' => $a['created_at'], 'created_by_name' => $a['created_by_name'],
        'geometry' => json_decode($a['geojson'], true), 'households_inside' => $res['by_area'][intval($a['area_id'])] ?? 0,
    ];
}

// Phase 23: a household inside a Flood-Prone Zone is at risk, not confirmed affected.
$in_type = function (array $h, string $t): bool {
    foreach ($h['areas'] ?? [] as $a) if (($a['area_type'] ?? AREA_TYPE_AFFECTED) === $t) return true;
    return false;
};
$in_recorded = array_values(array_filter($res['inside'], fn($h) => $in_type($h, AREA_TYPE_AFFECTED)));
$in_flood_prone = array_values(array_filter($res['inside'], fn($h) => $in_type($h, AREA_TYPE_FLOOD_PRONE)));

echo json_encode([
    "success" => true,
    "summary" => [
        "areas" => count($area_out),
        "hazard_types" => array_values(array_unique(array_column($area_out, 'hazard_type'))),
        "affected_households" => count($res['inside']),
        "households_in_recorded_affected_areas" => count($in_recorded),
        "households_in_flood_prone_zones" => count($in_flood_prone),
        "recorded_affected_areas" => count(array_filter($area_out, fn($a) => $a['area_type'] === AREA_TYPE_AFFECTED)),
        "flood_prone_zones" => count(array_filter($area_out, fn($a) => $a['area_type'] === AREA_TYPE_FLOOD_PRONE)),
        "flood_prone_note" => "Flood-prone zones are reference areas recorded by the barangay. A household inside one is at risk, not confirmed flooded; the system does not detect flooding in real time.",
        "outside_households" => count($res['outside']),
        "households_without_coordinates" => count($res['missing']),
        "total_households" => count($res['inside']) + count($res['outside']) + count($res['missing']),
        "affected_persons" => array_sum(array_column($res['inside'], 'number_of_members')),
        "affected_vulnerable_persons" => array_sum(array_column($res['inside'], 'vulnerable_members')),
        "method" => "Point-in-polygon on the server using each household's recorded latitude/longitude.",
    ],
    "areas" => $area_out,
    "inside" => $res['inside'],
    "outside" => $res['outside'],
    "missing_coordinates" => $res['missing'],
]);

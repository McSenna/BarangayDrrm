<?php
/**
 * Phase 24 — Purok location review (read-only).
 *
 * GET, Administrator and Relief Personnel only (residents: 403).
 * Compares every household's STORED Purok with where its saved coordinates
 * fall among the candidate Purok boundaries. Nothing is written: a household's
 * Purok is never changed automatically. Officials correct a confirmed
 * mismatch through the normal Households page (validated, audit-logged).
 *
 * Optional: ?purok=Purok%205A limits the household list to one stored Purok.
 *
 * GIS map (additive): each household also carries flood_status
 * (flood_prone | not_designated | unverified | unmapped, see lib/flood_zones.php),
 * needs_review and number_of_members; the response adds flood_zones,
 * per_purok counts and flood_summary. All counts come from the database rows
 * read below — nothing is stored or estimated.
 */
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../lib/purok_boundaries.php';
require_once __DIR__ . '/../lib/flood_zones.php';

require_login(['admin', 'relief_personnel']);
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(["success" => false, "message" => "Method not allowed."]);
    exit();
}

$filter = isset($_GET['purok']) && is_string($_GET['purok']) && $_GET['purok'] !== '' ? $_GET['purok'] : null;
if ($filter !== null && !in_array($filter, BINITAYAN_PUROKS, true)) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "Please choose one of the standard Puroks."]);
    exit();
}

$b = purok_boundaries_load();
$conn = (new Database())->connect();
$sql = "SELECT household_id, head_of_family, purok, address, number_of_members, latitude, longitude FROM households";
$params = [];
if ($filter !== null) { $sql .= " WHERE purok = :p"; $params[':p'] = $filter; }
$st = $conn->prepare($sql . " ORDER BY household_id");
$st->execute($params);

$rows = [];
$counts = array_fill_keys(['match', 'mismatch', 'on_boundary', 'ambiguous', 'outside_all', 'outside_barangay', 'unverified_area', 'no_coordinates'], 0);
$flood = array_fill_keys(['flood_prone', 'not_designated', 'unverified', 'unmapped'], 0);
$per_purok = [];
foreach (BINITAYAN_PUROKS as $p) {
    $per_purok[$p] = ['purok' => $p, 'designation' => flood_designation($p), 'registered' => 0, 'mapped' => 0, 'unmapped' => 0, 'inside_polygon' => 0];
}
$other_stored = ['registered' => 0, 'mapped' => 0, 'unmapped' => 0]; // stored Purok values that are not one of the standard Puroks
$needs_review = 0;
foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $h) {
    $c = purok_classify($h['purok'], $h['latitude'], $h['longitude'], $b['features']);
    $counts[$c['status']]++;
    $fs = household_flood_status($c);
    $flood[$fs]++;
    $review = household_needs_location_review($c);
    if ($review) $needs_review++;
    $has_coords = $c['status'] !== 'no_coordinates';
    $std = $c['stored_standard'];
    if ($std !== null && isset($per_purok[$std])) $bucket = &$per_purok[$std]; else $bucket = &$other_stored;
    $bucket['registered']++;
    $bucket[$has_coords ? 'mapped' : 'unmapped']++;
    unset($bucket);
    if ($c['spatial_purok'] !== null && isset($per_purok[$c['spatial_purok']])) $per_purok[$c['spatial_purok']]['inside_polygon']++;
    $rows[] = [
        'household_id' => intval($h['household_id']),
        'head_of_family' => $h['head_of_family'],
        'stored_purok' => $h['purok'],
        'address' => $h['address'],
        'number_of_members' => intval($h['number_of_members']),
        'flood_status' => $fs,
        'needs_review' => $review,
        'latitude' => $h['latitude'] === null ? null : floatval($h['latitude']),
        'longitude' => $h['longitude'] === null ? null : floatval($h['longitude']),
    ] + $c;
}

$features = array_map(fn($f) => [
    'name' => $f['name'], 'valid' => $f['valid'], 'problems' => $f['problems'], 'vertices' => $f['vertices'],
    'closure_gap_m' => $f['closure_gap_m'], 'closed_as_supplied' => $f['closed_as_supplied'],
], $b['features']);

echo json_encode([
    "success" => true,
    "boundaries" => [
        "file_found" => $b['file_found'],
        "status" => "candidate",
        "valid_count" => $b['valid_count'],
        "total" => count($features),
        "features" => $features,
        // Classification is offered only as a review aid while the boundaries are candidates.
        "classification_mode" => "review_only",
        "note" => "Candidate Purok boundaries supplied by the project team — not an official survey. Results are for review; stored Purok values are never changed automatically. Households inside a Purok whose boundary failed validation are reported as unverified.",
        "edge_tolerance_m" => PUROK_EDGE_TOLERANCE_M,
    ],
    "summary" => $counts + ["households" => count($rows)],
    "flood_zones" => [
        "flood_prone_puroks" => FLOOD_PRONE_PUROKS,
        "designations" => array_map(fn($p) => ["purok" => $p, "designation" => flood_designation($p)], BINITAYAN_PUROKS),
        "note" => FLOOD_DESIGNATION_NOTE,
    ],
    "flood_summary" => [
        "registered" => count($rows),
        "mapped" => count($rows) - $flood['unmapped'],
        "needs_review" => $needs_review,
    ] + $flood,
    "per_purok" => array_values($per_purok),
    "other_stored_puroks" => $other_stored,
    "households" => $rows,
]);

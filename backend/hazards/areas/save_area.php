<?php
/**
 * Phase 20 — record (no area_id) or update (area_id) an affected/flood area.
 * Admin only. The GeoJSON is validated and normalized on the server
 * (lib/affected_areas.php); invalid geometry is refused with HTTP 400.
 */
require_once __DIR__ . '/../../config/cors.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../lib/affected_areas.php';

require_login(['admin']);
if (!in_array($_SERVER['REQUEST_METHOD'], ['POST', 'PUT'], true)) {
    http_response_code(405);
    echo json_encode(["success" => false, "message" => "Method not allowed."]);
    exit();
}
$data = json_decode(file_get_contents("php://input"), true);
if (!is_array($data)) $data = [];
$conn = (new Database())->connect();
phase20_require_tables($conn);

$bad = function ($m, $code = 400) { http_response_code($code); echo json_encode(["success" => false, "message" => $m]); exit(); };
$area_id = isset($data['area_id']) ? input_positive_int($data['area_id']) : 0;
$event_id = input_positive_int($data['event_id'] ?? null);
$hazard = is_string($data['hazard_type'] ?? null) ? $data['hazard_type'] : '';
$name = is_string($data['area_name'] ?? null) ? mb_substr(trim($data['area_name']), 0, 150) : '';
$description = is_string($data['description'] ?? null) ? mb_substr(trim($data['description']), 0, 5000) : '';
// Phase 23: area type. A Recorded Affected Area needs its disaster event; a
// Flood-Prone Zone is reference geography (not active flooding) and may have none.
$has_type = areas_have_type_column($conn);
$area_type = is_string($data['area_type'] ?? null) && $data['area_type'] !== '' ? $data['area_type'] : AREA_TYPE_AFFECTED;
if (!in_array($area_type, AREA_TYPES, true)) $bad("Please choose the area type: Recorded Affected Area or Flood-Prone Zone.");
if ($area_type === AREA_TYPE_FLOOD_PRONE && !$has_type) $bad("Flood-prone zones need the Phase 23 database update (migration_phase23_core_modules.sql).", 503);

if ($area_type === AREA_TYPE_AFFECTED && !$event_id) $bad("Please select the disaster event for this area.");
if ($event_id) {
    $ev = $conn->prepare("SELECT event_id FROM disaster_events WHERE event_id = :id");
    $ev->execute([':id' => $event_id]);
    if (!$ev->fetch()) $bad("The selected event could not be found.", 404);
}
$event_value = $event_id ?: null;
if (!in_array($hazard, AREA_HAZARD_TYPES, true)) $bad("Please select a valid hazard type.");
if ($name === '') $bad("Please enter the area name.");

$geo = validate_area_geojson($data['geojson'] ?? null);
if (!$geo['ok']) $bad($geo['message']);
$geojson = json_encode($geo['geometry']);

if ($area_id) {
    $u = $conn->prepare("UPDATE disaster_affected_areas SET event_id = :e, hazard_type = :h, area_name = :n, description = :d,
                         geojson = :g, vertex_count = :v, updated_by = :by" . ($has_type ? ", area_type = :t" : "") . " WHERE area_id = :id");
    $u->execute([':e' => $event_value, ':h' => $hazard, ':n' => $name, ':d' => $description ?: null, ':g' => $geojson,
                 ':v' => $geo['vertex_count'], ':by' => $_SESSION['user_id'], ':id' => $area_id] + ($has_type ? [':t' => $area_type] : []));
    $chk = $conn->prepare("SELECT 1 FROM disaster_affected_areas WHERE area_id = :id");
    $chk->execute([':id' => $area_id]);
    if (!$chk->fetch()) $bad("The area could not be found. Please refresh the page.", 404);
    $id = $area_id;
    log_action($conn, "Affected area updated", "area_id: $id ($name), type: $area_type, event_id: " . ($event_value ?? 'none') . ", vertices: {$geo['vertex_count']}");
    $msg = "$area_type updated.";
} else {
    $i = $conn->prepare("INSERT INTO disaster_affected_areas (event_id, hazard_type, area_name, description, geojson, vertex_count, created_by, updated_by"
                         . ($has_type ? ", area_type" : "") . ")
                         VALUES (:e, :h, :n, :d, :g, :v, :by, :by2" . ($has_type ? ", :t" : "") . ")");
    $i->execute([':e' => $event_value, ':h' => $hazard, ':n' => $name, ':d' => $description ?: null, ':g' => $geojson,
                 ':v' => $geo['vertex_count'], ':by' => $_SESSION['user_id'], ':by2' => $_SESSION['user_id']] + ($has_type ? [':t' => $area_type] : []));
    $id = intval($conn->lastInsertId());
    log_action($conn, "Affected area recorded", "area_id: $id ($name), type: $area_type, event_id: " . ($event_value ?? 'none') . ", hazard: $hazard, vertices: {$geo['vertex_count']}");
    http_response_code(201);
    $msg = "$area_type recorded.";
}

// Immediately report how many households fall inside it (server-side point-in-polygon).
$areas = fetch_affected_areas($conn, null, $id, 'all');
$res = affected_households_for_areas($conn, $areas);
echo json_encode([
    "success" => true,
    "message" => $msg . " " . count($res['inside']) . " household(s) with recorded coordinates are inside this area.",
    "area_id" => $id,
    "households_inside" => count($res['inside']),
    "households_missing_coordinates" => count($res['missing']),
]);

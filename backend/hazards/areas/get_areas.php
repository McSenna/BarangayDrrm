<?php
/** Phase 20 — list recorded affected areas (GeoJSON included). Admin and relief personnel. */
require_once __DIR__ . '/../../config/cors.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../lib/affected_areas.php';

require_login(['admin', 'relief_personnel', 'field_officer']);
$conn = (new Database())->connect();
phase20_require_tables($conn);

$event_id = isset($_GET['event_id']) ? input_positive_int($_GET['event_id']) : 0;
$status = $_GET['status'] ?? 'all';
$type = isset($_GET['area_type']) && is_string($_GET['area_type']) ? $_GET['area_type'] : null;
$areas = fetch_affected_areas($conn, $event_id ?: null, null, is_string($status) ? $status : 'all', $type);
foreach ($areas as &$a) {
    $a['geometry'] = json_decode($a['geojson'], true);
    unset($a['geojson']);
    foreach (['area_id', 'vertex_count'] as $k) $a[$k] = intval($a[$k]);
    $a['event_id'] = $a['event_id'] === null ? null : intval($a['event_id']);
    $a['area_type'] = $a['area_type'] ?? AREA_TYPE_AFFECTED;
}
echo json_encode(["success" => true, "data" => $areas]);

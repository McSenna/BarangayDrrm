<?php
/**
 * Phase 23 — Geographic Coordinates System: set a household's map location.
 *
 * Administrator and Relief Personnel only (residents get 403). Only latitude and
 * longitude change; nothing else on the household is touched. The browser's
 * values are never trusted: the household ID is strictly validated, and the
 * coordinates are checked on the server against the official Barangay
 * Binitayan boundary (same rule as add/update household). Audit-logged with
 * the previous and new values.
 */
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../utils/boundary_validator.php';
require_once __DIR__ . '/../lib/affected_areas.php'; // input_positive_int

require_login(['admin', 'relief_personnel']);

if ($_SERVER['REQUEST_METHOD'] !== 'POST' && $_SERVER['REQUEST_METHOD'] !== 'PUT') {
    http_response_code(405);
    echo json_encode(["success" => false, "message" => "Method not allowed."]);
    exit();
}

$data = json_decode(file_get_contents("php://input"), true);
if (!is_array($data)) $data = [];
$bad = function (string $msg, int $code = 400) {
    http_response_code($code);
    echo json_encode(["success" => false, "message" => $msg]);
    exit();
};

$household_id = input_positive_int($data['household_id'] ?? null);
if (!$household_id) $bad("We couldn't identify this household. Please refresh the page and try again.");

$conn = (new Database())->connect();
field_require_household($conn, $household_id);

$lat = $data['latitude'] ?? null;
$lng = $data['longitude'] ?? null;
foreach ([$lat, $lng] as $v) {
    if (!is_string($v) && !is_int($v) && !is_float($v)) $bad("Please enter both latitude and longitude.");
}
$lat = trim((string) $lat);
$lng = trim((string) $lng);
if ($lat === '' || $lng === '') $bad("Please enter both latitude and longitude.");
$check = validate_household_coordinates($lat, $lng);
if (!$check['valid']) $bad($check['message']);
$lat_v = round(floatval($lat), 7);
$lng_v = round(floatval($lng), 7);


$cur = $conn->prepare("SELECT head_of_family, latitude, longitude FROM households WHERE household_id = :id");
$cur->execute([':id' => $household_id]);
$row = $cur->fetch(PDO::FETCH_ASSOC);
if (!$row) $bad("Household not found. It may have been removed.", 404);

$u = $conn->prepare("UPDATE households SET latitude = :lat, longitude = :lng WHERE household_id = :id");
$u->execute([':lat' => $lat_v, ':lng' => $lng_v, ':id' => $household_id]);

$prev = ($row['latitude'] === null || $row['longitude'] === null) ? 'none' : "{$row['latitude']}, {$row['longitude']}";
log_action($conn, "Household coordinates updated", "household_id: $household_id ({$row['head_of_family']}), from: $prev, to: $lat_v, $lng_v");

echo json_encode([
    "success" => true,
    "message" => "Map location saved for {$row['head_of_family']}.",
    "household_id" => $household_id,
    "latitude" => $lat_v,
    "longitude" => $lng_v,
]);

<?php
/** Phase 20 — delete a wrongly recorded affected area. Admin only. Households are not affected. */
require_once __DIR__ . '/../../config/cors.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../lib/affected_areas.php';

require_login(['admin']);
if (!in_array($_SERVER['REQUEST_METHOD'], ['POST', 'DELETE'], true)) { http_response_code(405); echo json_encode(["success" => false, "message" => "Method not allowed."]); exit(); }
$data = json_decode(file_get_contents("php://input"), true);
if (!is_array($data)) $data = [];
$area_id = input_positive_int($data['area_id'] ?? null);
if (!$area_id) { http_response_code(400); echo json_encode(["success" => false, "message" => "Please choose a valid area."]); exit(); }
$conn = (new Database())->connect();
phase20_require_tables($conn);
$name = $conn->prepare("SELECT area_name FROM disaster_affected_areas WHERE area_id = :id");
$name->execute([':id' => $area_id]);
$n = $name->fetchColumn();
if ($n === false) { http_response_code(404); echo json_encode(["success" => false, "message" => "The area could not be found."]); exit(); }
$d = $conn->prepare("DELETE FROM disaster_affected_areas WHERE area_id = :id");
$d->execute([':id' => $area_id]);
log_action($conn, "Affected area deleted", "area_id: $area_id ($n)");
echo json_encode(["success" => true, "message" => "Affected area deleted."]);

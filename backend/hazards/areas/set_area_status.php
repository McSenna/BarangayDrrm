<?php
/** Phase 20 — mark an affected area Active or Resolved. Admin only. */
require_once __DIR__ . '/../../config/cors.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../lib/affected_areas.php';

require_login(['admin']);
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); echo json_encode(["success" => false, "message" => "Method not allowed."]); exit(); }
$data = json_decode(file_get_contents("php://input"), true);
if (!is_array($data)) $data = [];
$area_id = input_positive_int($data['area_id'] ?? null);
$status = $data['status'] ?? '';
if (!$area_id || !in_array($status, ['Active', 'Resolved'], true)) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "Please choose a valid area and status."]);
    exit();
}
$conn = (new Database())->connect();
phase20_require_tables($conn);
$u = $conn->prepare("UPDATE disaster_affected_areas SET status = :s, updated_by = :by,
                     resolved_at = IF(:s2 = 'Resolved', NOW(), NULL) WHERE area_id = :id");
$u->execute([':s' => $status, ':s2' => $status, ':by' => $_SESSION['user_id'], ':id' => $area_id]);
$chk = $conn->prepare("SELECT 1 FROM disaster_affected_areas WHERE area_id = :id");
$chk->execute([':id' => $area_id]);
if (!$chk->fetch()) { http_response_code(404); echo json_encode(["success" => false, "message" => "The area could not be found."]); exit(); }
log_action($conn, "Affected area status changed", "area_id: $area_id, status: $status");
echo json_encode(["success" => true, "message" => "Area marked as $status."]);

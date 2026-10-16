<?php
/** Phase 20 — close or reopen a disaster event. Admin only. */
require_once __DIR__ . '/../../config/cors.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../lib/affected_areas.php';

require_login(['admin']);
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); echo json_encode(["success" => false, "message" => "Method not allowed."]); exit(); }
$data = json_decode(file_get_contents("php://input"), true);
if (!is_array($data)) $data = [];
$event_id = input_positive_int($data['event_id'] ?? null);
$status = $data['status'] ?? '';
if (!$event_id || !in_array($status, ['Active', 'Closed'], true)) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "Please choose a valid event and status."]);
    exit();
}
$conn = (new Database())->connect();
phase20_require_tables($conn);
$u = $conn->prepare("UPDATE disaster_events SET status = :s WHERE event_id = :id");
$u->execute([':s' => $status, ':id' => $event_id]);
$chk = $conn->prepare("SELECT 1 FROM disaster_events WHERE event_id = :id");
$chk->execute([':id' => $event_id]);
if (!$chk->fetch()) { http_response_code(404); echo json_encode(["success" => false, "message" => "The event could not be found."]); exit(); }
log_action($conn, "Disaster event status changed", "event_id: $event_id, status: $status");
echo json_encode(["success" => true, "message" => "Event marked as $status."]);

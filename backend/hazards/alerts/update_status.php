<?php
require_once __DIR__ . '/../../config/cors.php';
require_once __DIR__ . '/../../config/database.php';

require_login(['admin']);

$data = json_decode(file_get_contents("php://input"), true);
$alert_id = intval($data['alert_id'] ?? 0);
$status = $data['status'] ?? '';
$resolve = !empty($data['resolve']);

if ($alert_id <= 0) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "alert_id is required."]);
    exit();
}

$valid_status = ['Normal', 'Alert', 'Warning', 'Critical'];

$database = new Database();
$conn = $database->connect();

$check = $conn->prepare("SELECT alert_id FROM hazard_alerts WHERE alert_id = :alert_id");
$check->execute([':alert_id' => $alert_id]);
if (!$check->fetch()) {
    http_response_code(404);
    echo json_encode(["success" => false, "message" => "Hazard alert not found."]);
    exit();
}

if ($resolve) {
    $stmt = $conn->prepare(
        "UPDATE hazard_alerts SET is_active = 0, resolved_by = :resolved_by, resolved_at = NOW() WHERE alert_id = :alert_id"
    );
    $stmt->execute([':resolved_by' => $_SESSION['user_id'], ':alert_id' => $alert_id]);
    log_action($conn, "Hazard alert resolved", "alert_id: $alert_id");
    echo json_encode(["success" => true, "message" => "Hazard alert marked as resolved."]);
    exit();
}

if (!in_array($status, $valid_status)) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "A valid status is required."]);
    exit();
}

$stmt = $conn->prepare("UPDATE hazard_alerts SET status = :status WHERE alert_id = :alert_id");
$stmt->execute([':status' => $status, ':alert_id' => $alert_id]);

log_action($conn, "Hazard alert status updated", "alert_id: $alert_id, status: $status");

echo json_encode(["success" => true, "message" => "Hazard alert status updated."]);

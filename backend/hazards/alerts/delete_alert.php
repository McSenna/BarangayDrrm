<?php
require_once __DIR__ . '/../../config/cors.php';
require_once __DIR__ . '/../../config/database.php';

require_login(['admin']);

$data = json_decode(file_get_contents("php://input"), true);
$alert_id = intval($data['alert_id'] ?? $_GET['alert_id'] ?? 0);

if ($alert_id <= 0) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "alert_id is required."]);
    exit();
}

$database = new Database();
$conn = $database->connect();

$conn->prepare("DELETE FROM hazard_alerts WHERE alert_id = :alert_id")->execute([':alert_id' => $alert_id]);

log_action($conn, "Hazard alert deleted", "alert_id: $alert_id");

echo json_encode(["success" => true, "message" => "Hazard alert deleted."]);

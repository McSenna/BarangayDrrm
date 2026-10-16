<?php
require_once __DIR__ . '/../../config/cors.php';
require_once __DIR__ . '/../../config/database.php';

require_login(['admin']);

$data = json_decode(file_get_contents("php://input"), true);
$schedule_id = intval($data['schedule_id'] ?? $_GET['schedule_id'] ?? 0);

if ($schedule_id <= 0) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "The schedule could not be found. Please refresh the page and try again."]);
    exit();
}

$database = new Database();
$conn = $database->connect();

$check = $conn->prepare("SELECT COUNT(*) FROM distribution_beneficiaries WHERE schedule_id = :schedule_id AND status = 'Delivered'");
$check->execute([':schedule_id' => $schedule_id]);
if (intval($check->fetchColumn()) > 0) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "This schedule cannot be deleted because relief has already been delivered. It is kept for record-keeping."]);
    exit();
}

$conn->prepare("DELETE FROM distribution_schedules WHERE schedule_id = :schedule_id")->execute([':schedule_id' => $schedule_id]);

log_action($conn, "Distribution schedule deleted", "schedule_id: $schedule_id");

echo json_encode(["success" => true, "message" => "Schedule deleted."]);

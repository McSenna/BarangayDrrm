<?php
require_once __DIR__ . '/../../config/cors.php';
require_once __DIR__ . '/../../config/database.php';

require_login(['admin']);

$data = json_decode(file_get_contents("php://input"), true);
$weather_id = intval($data['weather_id'] ?? $_GET['weather_id'] ?? 0);

if ($weather_id <= 0) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "weather_id is required."]);
    exit();
}

$database = new Database();
$conn = $database->connect();

$conn->prepare("DELETE FROM weather_logs WHERE weather_id = :weather_id")->execute([':weather_id' => $weather_id]);

log_action($conn, "Weather log deleted", "weather_id: $weather_id");

echo json_encode(["success" => true, "message" => "Weather log deleted."]);

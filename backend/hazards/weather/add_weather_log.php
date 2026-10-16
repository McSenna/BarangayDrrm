<?php
require_once __DIR__ . '/../../config/cors.php';
require_once __DIR__ . '/../../config/database.php';

require_login(['admin']);

$data = json_decode(file_get_contents("php://input"), true);

$log_date = $data['log_date'] ?? date('Y-m-d');
$log_time = !empty($data['log_time']) ? $data['log_time'] : null;
$temperature = $data['temperature'] !== '' && isset($data['temperature']) ? floatval($data['temperature']) : null;
$rainfall_mm = $data['rainfall_mm'] !== '' && isset($data['rainfall_mm']) ? floatval($data['rainfall_mm']) : null;
$wind_speed_kph = $data['wind_speed_kph'] !== '' && isset($data['wind_speed_kph']) ? floatval($data['wind_speed_kph']) : null;
$wind_direction = trim($data['wind_direction'] ?? '');
$remarks = trim($data['remarks'] ?? '');

$valid_conditions = ['Sunny', 'Cloudy', 'Overcast', 'Rainy', 'Stormy', 'Foggy', 'Other'];
$weather_condition = in_array($data['weather_condition'] ?? '', $valid_conditions) ? $data['weather_condition'] : 'Sunny';

$database = new Database();
$conn = $database->connect();

$stmt = $conn->prepare(
    "INSERT INTO weather_logs (log_date, log_time, temperature, rainfall_mm, weather_condition, wind_speed_kph, wind_direction, source, remarks, recorded_by)
     VALUES (:log_date, :log_time, :temperature, :rainfall_mm, :weather_condition, :wind_speed_kph, :wind_direction, 'Manual', :remarks, :recorded_by)"
);

$stmt->execute([
    ':log_date' => $log_date,
    ':log_time' => $log_time,
    ':temperature' => $temperature,
    ':rainfall_mm' => $rainfall_mm,
    ':weather_condition' => $weather_condition,
    ':wind_speed_kph' => $wind_speed_kph,
    ':wind_direction' => $wind_direction,
    ':remarks' => $remarks,
    ':recorded_by' => $_SESSION['user_id'],
]);

// Phase 17 fix: capture the new log's ID before log_action() inserts into
// audit_logs (see disasters/create_report.php for the same bug pattern).
$weather_id = $conn->lastInsertId();

log_action($conn, "Weather log added", "$log_date $weather_condition");

http_response_code(201);
echo json_encode(["success" => true, "message" => "Weather log added.", "weather_id" => $weather_id]);

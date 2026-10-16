<?php
require_once __DIR__ . '/../../config/cors.php';
require_once __DIR__ . '/../../config/database.php';

require_login(['admin']);

$data = json_decode(file_get_contents("php://input"), true);
$type_name = trim($data['type_name'] ?? '');

if ($type_name === '') {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "Please enter a disaster type name."]);
    exit();
}

$database = new Database();
$conn = $database->connect();

$check = $conn->prepare("SELECT type_id FROM disaster_types WHERE type_name = :name");
$check->execute([':name' => $type_name]);
if ($check->fetch()) {
    http_response_code(409);
    echo json_encode(["success" => false, "message" => "This disaster type already exists."]);
    exit();
}

$stmt = $conn->prepare("INSERT INTO disaster_types (type_name, is_active) VALUES (:name, 1)");
$stmt->execute([':name' => $type_name]);

// Phase 17 fix: capture the new type's ID before log_action() inserts into
// audit_logs (see disasters/create_report.php for the same bug pattern).
$type_id = $conn->lastInsertId();

log_action($conn, "Disaster type added", $type_name);

http_response_code(201);
echo json_encode(["success" => true, "message" => "Disaster type added.", "type_id" => $type_id]);

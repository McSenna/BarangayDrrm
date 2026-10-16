<?php
require_once __DIR__ . '/../../config/cors.php';
require_once __DIR__ . '/../../config/database.php';

require_login(['admin']);

$data = json_decode(file_get_contents("php://input"), true);
$type_id = intval($data['type_id'] ?? 0);
$type_name = trim($data['type_name'] ?? '');
$is_active = isset($data['is_active']) ? intval($data['is_active']) : 1;

if ($type_id <= 0 || $type_name === '') {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "Please enter a disaster type name."]);
    exit();
}

$database = new Database();
$conn = $database->connect();

$existing = $conn->prepare("SELECT type_name FROM disaster_types WHERE type_id = :id");
$existing->execute([':id' => $type_id]);
$old = $existing->fetch(PDO::FETCH_ASSOC);

if (!$old) {
    http_response_code(404);
    echo json_encode(["success" => false, "message" => "Disaster type not found."]);
    exit();
}

$check = $conn->prepare("SELECT type_id FROM disaster_types WHERE type_name = :name AND type_id != :id");
$check->execute([':name' => $type_name, ':id' => $type_id]);
if ($check->fetch()) {
    http_response_code(409);
    echo json_encode(["success" => false, "message" => "Another disaster type already uses this name."]);
    exit();
}

$conn->beginTransaction();

$stmt = $conn->prepare("UPDATE disaster_types SET type_name = :name, is_active = :is_active WHERE type_id = :id");
$stmt->execute([':name' => $type_name, ':is_active' => $is_active, ':id' => $type_id]);

// If the name changed, cascade the rename into any disaster_reports already using the old name
if ($old['type_name'] !== $type_name) {
    $cascade = $conn->prepare("UPDATE disaster_reports SET disaster_type = :new_name WHERE disaster_type = :old_name");
    $cascade->execute([':new_name' => $type_name, ':old_name' => $old['type_name']]);
}

$conn->commit();

log_action($conn, "Disaster type updated", "type_id: $type_id -> $type_name");

echo json_encode(["success" => true, "message" => "Disaster type updated."]);

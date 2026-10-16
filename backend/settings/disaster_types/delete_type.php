<?php
require_once __DIR__ . '/../../config/cors.php';
require_once __DIR__ . '/../../config/database.php';

require_login(['admin']);

$data = json_decode(file_get_contents("php://input"), true);
$type_id = intval($data['type_id'] ?? 0);

if ($type_id <= 0) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "We couldn't identify this disaster type. Please refresh the page and try again."]);
    exit();
}

$database = new Database();
$conn = $database->connect();

$find = $conn->prepare("SELECT type_name FROM disaster_types WHERE type_id = :id");
$find->execute([':id' => $type_id]);
$type = $find->fetch(PDO::FETCH_ASSOC);

if (!$type) {
    http_response_code(404);
    echo json_encode(["success" => false, "message" => "Disaster type not found."]);
    exit();
}

// Block hard delete if any disaster report still uses this type — deactivating
// it instead keeps existing reports valid and simply hides it from the dropdown.
$inUse = $conn->prepare("SELECT COUNT(*) FROM disaster_reports WHERE disaster_type = :name");
$inUse->execute([':name' => $type['type_name']]);
if (intval($inUse->fetchColumn()) > 0) {
    http_response_code(409);
    echo json_encode(["success" => false, "message" => "This disaster type cannot be deleted because existing disaster reports use it. You can deactivate it instead."]);
    exit();
}

$stmt = $conn->prepare("DELETE FROM disaster_types WHERE type_id = :id");
$stmt->execute([':id' => $type_id]);

log_action($conn, "Disaster type deleted", $type['type_name']);

echo json_encode(["success" => true, "message" => "Disaster type deleted."]);

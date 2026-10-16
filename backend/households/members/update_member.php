<?php
require_once __DIR__ . '/../../config/cors.php';
require_once __DIR__ . '/../../config/database.php';

require_login(['admin']);

$data = json_decode(file_get_contents("php://input"), true);
$member_id = intval($data['member_id'] ?? 0);

if ($member_id <= 0) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "member_id is required."]);
    exit();
}

$full_name = trim($data['full_name'] ?? '');
if ($full_name === '') {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "Please enter the household member's full name."]);
    exit();
}

$database = new Database();
$conn = $database->connect();

$stmt = $conn->prepare(
    "UPDATE household_members SET full_name = :full_name, relationship = :relationship, age = :age WHERE member_id = :member_id"
);
$stmt->execute([
    ':full_name' => $full_name,
    ':relationship' => trim($data['relationship'] ?? ''),
    ':age' => $data['age'] !== '' && isset($data['age']) ? intval($data['age']) : null,
    ':member_id' => $member_id,
]);

log_action($conn, "Household member updated", "member_id: $member_id");

echo json_encode(["success" => true, "message" => "Member updated."]);

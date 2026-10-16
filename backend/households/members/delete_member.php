<?php
require_once __DIR__ . '/../../config/cors.php';
require_once __DIR__ . '/../../config/database.php';

require_login(['admin']);

$data = json_decode(file_get_contents("php://input"), true);
$member_id = intval($data['member_id'] ?? $_GET['member_id'] ?? 0);

if ($member_id <= 0) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "member_id is required."]);
    exit();
}

$database = new Database();
$conn = $database->connect();

$stmt = $conn->prepare("DELETE FROM household_members WHERE member_id = :member_id");
$stmt->execute([':member_id' => $member_id]);

log_action($conn, "Household member deleted", "member_id: $member_id");

echo json_encode(["success" => true, "message" => "Household member removed."]);

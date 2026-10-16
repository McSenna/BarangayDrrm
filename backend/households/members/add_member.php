<?php
require_once __DIR__ . '/../../config/cors.php';
require_once __DIR__ . '/../../config/database.php';

require_login(['admin']);

$data = json_decode(file_get_contents("php://input"), true);
$household_id = intval($data['household_id'] ?? 0);
$full_name = trim($data['full_name'] ?? '');
$relationship = trim($data['relationship'] ?? '');
$age = $data['age'] !== '' && isset($data['age']) ? intval($data['age']) : null;

if ($household_id <= 0 || $full_name === '') {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "Please enter the household member's full name."]);
    exit();
}

$database = new Database();
$conn = $database->connect();

$check = $conn->prepare("SELECT household_id FROM households WHERE household_id = :household_id");
$check->execute([':household_id' => $household_id]);
if (!$check->fetch()) {
    http_response_code(404);
    echo json_encode(["success" => false, "message" => "Household not found."]);
    exit();
}

$stmt = $conn->prepare(
    "INSERT INTO household_members (household_id, full_name, relationship, age)
     VALUES (:household_id, :full_name, :relationship, :age)"
);
$stmt->execute([
    ':household_id' => $household_id,
    ':full_name' => $full_name,
    ':relationship' => $relationship,
    ':age' => $age,
]);

// Phase 17 fix: capture the new member's ID before log_action() inserts into
// audit_logs (see disasters/create_report.php for the same bug pattern).
$member_id = $conn->lastInsertId();

log_action($conn, "Household member added", "household_id: $household_id, name: $full_name");

http_response_code(201);
echo json_encode(["success" => true, "message" => "Member added.", "member_id" => $member_id]);

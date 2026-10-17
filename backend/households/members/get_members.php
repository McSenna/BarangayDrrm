<?php
require_once __DIR__ . '/../../config/cors.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../lib/household_profile.php';

require_login(); // any logged-in role; scoped below

$household_id = intval($_GET['household_id'] ?? 0);
if ($household_id <= 0) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "household_id is required."]);
    exit();
}

$database = new Database();
$conn = $database->connect();
field_require_household($conn, $household_id);

// Residents may only view members of their own household
if ($_SESSION['role'] === 'resident') {
    $check = $conn->prepare("SELECT household_id FROM households WHERE household_id = :household_id AND user_id = :user_id");
    $check->execute([':household_id' => $household_id, ':user_id' => $_SESSION['user_id']]);
    if (!$check->fetch()) {
        http_response_code(403);
        echo json_encode(["success" => false, "message" => "You do not have permission to view this household."]);
        exit();
    }
}

$stmt = $conn->prepare("SELECT * FROM household_members WHERE household_id = :household_id ORDER BY member_id ASC");
$stmt->execute([':household_id' => $household_id]);
$members = $stmt->fetchAll(PDO::FETCH_ASSOC);

$householdStmt = $conn->prepare('SELECT * FROM households WHERE household_id=?');
$householdStmt->execute([$household_id]);
$household = $householdStmt->fetch(PDO::FETCH_ASSOC);
if (!$household) { http_response_code(404); echo json_encode(['success'=>false,'message'=>'Household not found.']); exit; }
echo json_encode(["success" => true, "data" => $members, 'profile'=>household_profile_from_members($household,$members)]);

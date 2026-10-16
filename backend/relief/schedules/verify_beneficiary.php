<?php
require_once __DIR__ . '/../../config/cors.php';
require_once __DIR__ . '/../../config/database.php';

require_login(['admin', 'relief_personnel']);

$data = json_decode(file_get_contents("php://input"), true);
$beneficiary_id = intval($data['beneficiary_id'] ?? 0);

if ($beneficiary_id <= 0) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "The beneficiary could not be found. Please refresh the page and try again."]);
    exit();
}

$database = new Database();
$conn = $database->connect();

// Relief personnel may only verify beneficiaries on schedules assigned to them
if ($_SESSION['role'] === 'relief_personnel') {
    $check = $conn->prepare(
        "SELECT db.beneficiary_id FROM distribution_beneficiaries db
         JOIN distribution_schedules ds ON db.schedule_id = ds.schedule_id
         WHERE db.beneficiary_id = :beneficiary_id AND ds.assigned_personnel = :user_id"
    );
    $check->execute([':beneficiary_id' => $beneficiary_id, ':user_id' => $_SESSION['user_id']]);
    if (!$check->fetch()) {
        http_response_code(403);
        echo json_encode(["success" => false, "message" => "You are not assigned to this schedule."]);
        exit();
    }
}

$stmt = $conn->prepare(
    "UPDATE distribution_beneficiaries SET is_verified = 1, verified_by = :verified_by, verified_at = NOW() WHERE beneficiary_id = :beneficiary_id"
);
$stmt->execute([':verified_by' => $_SESSION['user_id'], ':beneficiary_id' => $beneficiary_id]);

log_action($conn, "Beneficiary verified", "beneficiary_id: $beneficiary_id");

echo json_encode(["success" => true, "message" => "Beneficiary verified."]);

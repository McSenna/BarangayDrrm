<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';

require_login(['admin']);
require_once __DIR__ . '/management.php';
$conn = null;
try {
if ($_SERVER['REQUEST_METHOD'] !== 'DELETE') um_fail(405, 'Method not allowed.');

$data = json_decode(file_get_contents("php://input"), true);
$user_id = intval($data['user_id'] ?? $_GET['user_id'] ?? 0);

if ($user_id <= 0) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "We couldn't identify this account. Please refresh the page and try again."]);
    exit();
}

if ($user_id === intval($_SESSION['user_id'])) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "You cannot delete your own account while logged in."]);
    exit();
}

$database = new Database();
$conn = $database->connect();
$admins = um_lock($conn);
$target = um_target($conn, $user_id);
um_guard($target, $_SESSION['user_id'], $target['role'], 0, $admins);

// Accounts that already have records in the system are kept for record-keeping.
// Deleting them would CASCADE-delete the resident's disaster reports (and their
// photos/assessments) and erase who approved, distributed or verified relief.
// Such accounts must be deactivated instead. Accounts without history can still
// be deleted as before.
$history_checks = [
    "SELECT 1 FROM disaster_reports WHERE user_id = :id OR verified_by = :id LIMIT 1",
    "SELECT 1 FROM households WHERE user_id = :id LIMIT 1",
    "SELECT 1 FROM relief_requests WHERE user_id = :id OR reviewed_by = :id OR processed_by = :id LIMIT 1",
    "SELECT 1 FROM relief_allocations WHERE approved_by = :id OR distributed_by = :id LIMIT 1",
    "SELECT 1 FROM household_allocations WHERE completed_by = :id OR cancelled_by = :id OR created_by = :id LIMIT 1",
    "SELECT 1 FROM household_allocation_history WHERE user_id = :id LIMIT 1",
    "SELECT 1 FROM household_field_assessments WHERE assigned_field_officer_id = :id OR created_by = :id OR updated_by = :id LIMIT 1",
    "SELECT 1 FROM relief_feedback WHERE user_id = :id LIMIT 1",
    "SELECT 1 FROM distribution_schedules WHERE assigned_personnel = :id OR created_by = :id LIMIT 1",
    "SELECT 1 FROM distribution_beneficiaries WHERE verified_by = :id OR status_updated_by = :id LIMIT 1",
    "SELECT 1 FROM delivery_reports WHERE submitted_by = :id LIMIT 1",
    "SELECT 1 FROM damage_assessments WHERE assessed_by = :id LIMIT 1",
    "SELECT 1 FROM inventory_logs WHERE performed_by = :id LIMIT 1",
];
foreach ($history_checks as $sql) {
    $check = $conn->prepare($sql);
    $check->execute([':id' => $user_id]);
    if ($check->fetchColumn()) {
        $conn->rollBack();
        http_response_code(409);
        echo json_encode(["success" => false, "message" => "This account has records in the system (reports, household, relief or delivery history) and cannot be deleted. Deactivate the account instead."]);
        exit();
    }
}

$stmt = $conn->prepare("DELETE FROM users WHERE user_id = :user_id");
$stmt->execute([':user_id' => $user_id]);

log_action($conn, "User deleted", "user_id: $user_id");
$conn->commit();

echo json_encode(["success" => true, "message" => "User deleted."]);
} catch (Throwable $e) { um_error($e, $conn); }

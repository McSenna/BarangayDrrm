<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../lib/notify.php';

require_login(['admin']);

$data = json_decode(file_get_contents("php://input"), true);
$report_id = intval($data['report_id'] ?? 0);
$remarks = trim($data['remarks'] ?? '');

if ($report_id <= 0) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "The disaster report could not be found. Please refresh the page and try again."]);
    exit();
}

$database = new Database();
$conn = $database->connect();

// Confirm the report exists before changing it, so a stale or invalid ID
// returns 404 instead of a false "success" and a misleading audit entry.
$exists = $conn->prepare("SELECT report_id FROM disaster_reports WHERE report_id = :report_id");
$exists->execute([':report_id' => $report_id]);
if (!$exists->fetch()) {
    http_response_code(404);
    echo json_encode(["success" => false, "message" => "The disaster report could not be found. Please refresh the page and try again."]);
    exit();
}

$stmt = $conn->prepare(
    "UPDATE disaster_reports
     SET status = 'Verified', verified_by = :verified_by, verified_at = NOW(), verification_remarks = :remarks
     WHERE report_id = :report_id"
);
$stmt->execute([
    ':verified_by' => $_SESSION['user_id'],
    ':remarks' => $remarks,
    ':report_id' => $report_id,
]);

log_action($conn, "Disaster report verified", "report_id: $report_id");

// Phase 21 — disaster reports are now recorded by authorized personnel, not
// by residents, so verification/rejection no longer sends a resident
// notification or SMS (residents receive relief-allocation notifications only).
// The action is recorded in the audit log above.
$sms_note = '';

echo json_encode(["success" => true, "message" => "Disaster report verified." . $sms_note]);

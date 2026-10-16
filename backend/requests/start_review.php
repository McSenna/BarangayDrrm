<?php
/** Admin marks a Pending relief request as Under Review (Phase 19). */
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../lib/notify.php';

require_login(['admin']);

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(["success" => false, "message" => "Method not allowed."]);
    exit();
}

$data = json_decode(file_get_contents("php://input"), true);
$request_id = intval($data['request_id'] ?? 0);
if ($request_id <= 0) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "Relief request not specified."]);
    exit();
}

$database = new Database();
$conn = $database->connect();

$stmt = $conn->prepare("UPDATE relief_requests SET status = 'Under Review', reviewed_by = :admin, reviewed_at = NOW() WHERE request_id = :id AND status = 'Pending'");
$stmt->execute([':admin' => $_SESSION['user_id'], ':id' => $request_id]);
if ($stmt->rowCount() !== 1) {
    http_response_code(409);
    echo json_encode(["success" => false, "message" => "Only Pending requests can be moved to Under Review. Please refresh the page."]);
    exit();
}
log_action($conn, "Relief request under review", "request_id: $request_id");

$hh = $conn->prepare("SELECT household_id, user_id FROM relief_requests WHERE request_id = :id");
$hh->execute([':id' => $request_id]);
$r = $hh->fetch(PDO::FETCH_ASSOC);
dispatch_notification($conn, [['household_id' => $r['household_id']]],
    "request:$request_id:under_review", "Relief request under review",
    "Your relief request #$request_id is now being reviewed by the Barangay Administrator.",
    ['link' => '/resident/relief-status', 'sms' => false]);

echo json_encode(["success" => true, "message" => "Request marked as Under Review."]);

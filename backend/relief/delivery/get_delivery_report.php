<?php
require_once __DIR__ . '/../../config/cors.php';
require_once __DIR__ . '/../../config/database.php';

require_login(['admin', 'relief_personnel']);

$beneficiary_id = intval($_GET['beneficiary_id'] ?? 0);
if ($beneficiary_id <= 0) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "The delivery report could not be found. Please refresh the page and try again."]);
    exit();
}

$database = new Database();
$conn = $database->connect();
staff_require_beneficiary($conn, $beneficiary_id);

$stmt = $conn->prepare(
    "SELECT dr.*, u.full_name AS submitted_by_name
     FROM delivery_reports dr
     LEFT JOIN users u ON dr.submitted_by = u.user_id
     WHERE dr.beneficiary_id = :beneficiary_id"
);
$stmt->execute([':beneficiary_id' => $beneficiary_id]);
$report = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$report) {
    echo json_encode(["success" => true, "data" => null]);
    exit();
}

$photo_stmt = $conn->prepare("SELECT * FROM delivery_report_photos WHERE report_id = :report_id ORDER BY photo_id ASC");
$photo_stmt->execute([':report_id' => $report['report_id']]);
$report['photos'] = $photo_stmt->fetchAll(PDO::FETCH_ASSOC);

echo json_encode(["success" => true, "data" => $report]);

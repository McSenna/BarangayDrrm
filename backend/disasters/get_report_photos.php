<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';

require_login(['admin', 'relief_personnel']); // Phase 21: staff only (residents no longer use this data)

$report_id = intval($_GET['report_id'] ?? 0);
if ($report_id <= 0) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "The disaster report could not be found. Please refresh the page and try again."]);
    exit();
}

$database = new Database();
$conn = $database->connect();

if ($_SESSION['role'] === 'resident') {
    $check = $conn->prepare("SELECT report_id FROM disaster_reports WHERE report_id = :report_id AND user_id = :user_id");
    $check->execute([':report_id' => $report_id, ':user_id' => $_SESSION['user_id']]);
    if (!$check->fetch()) {
        http_response_code(403);
        echo json_encode(["success" => false, "message" => "You do not have permission to view these photos."]);
        exit();
    }
}

$stmt = $conn->prepare("SELECT * FROM report_photos WHERE report_id = :report_id ORDER BY photo_id ASC");
$stmt->execute([':report_id' => $report_id]);
$photos = $stmt->fetchAll(PDO::FETCH_ASSOC);

echo json_encode(["success" => true, "data" => $photos]);

<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';

require_login(['admin']);
header('Cache-Control: no-store');

$user_id = intval($_GET['user_id'] ?? 0);
if ($user_id <= 0) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "user_id is required."]);
    exit();
}

$database = new Database();
$conn = $database->connect();

$stmt = $conn->prepare("SELECT user_id, full_name, email, role, is_active, contact_number, created_at FROM users WHERE user_id = :user_id");
$stmt->execute([':user_id' => $user_id]);
$user = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$user) {
    http_response_code(404);
    echo json_encode(["success" => false, "message" => "User not found."]);
    exit();
}

$hh_stmt = $conn->prepare("SELECT * FROM households WHERE user_id = :user_id LIMIT 1");
$hh_stmt->execute([':user_id' => $user_id]);
$household = $hh_stmt->fetch(PDO::FETCH_ASSOC) ?: null;

$reports_count = $conn->prepare("SELECT COUNT(*) FROM disaster_reports WHERE user_id = :user_id");
$reports_count->execute([':user_id' => $user_id]);

$user['household'] = $household;
$user['disaster_report_count'] = intval($reports_count->fetchColumn());

echo json_encode(["success" => true, "data" => $user]);

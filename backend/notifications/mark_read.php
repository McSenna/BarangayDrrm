<?php
/**
 * Mark the logged-in user's notifications as read (Phase 19).
 * Body: { "notification_id": 5 } for one, or { "all": true } for all.
 * Only rows owned by the session user can be changed.
 */
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';

require_login();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(["success" => false, "message" => "Method not allowed."]);
    exit();
}

$data = json_decode(file_get_contents("php://input"), true);
if (!is_array($data)) $data = [];

$database = new Database();
$conn = $database->connect();

if (!empty($data['all'])) {
    $stmt = $conn->prepare("UPDATE notifications SET is_read = 1, read_at = NOW() WHERE user_id = :user_id AND is_read = 0");
    $stmt->execute([':user_id' => $_SESSION['user_id']]);
    echo json_encode(["success" => true, "updated" => $stmt->rowCount()]);
    exit();
}

$notification_id = intval($data['notification_id'] ?? 0);
if ($notification_id <= 0) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "Notification not specified."]);
    exit();
}

$stmt = $conn->prepare("UPDATE notifications SET is_read = 1, read_at = COALESCE(read_at, NOW()) WHERE notification_id = :id AND user_id = :user_id");
$stmt->execute([':id' => $notification_id, ':user_id' => $_SESSION['user_id']]);
echo json_encode(["success" => true, "updated" => $stmt->rowCount()]);

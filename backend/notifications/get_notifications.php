<?php
/**
 * In-app notifications for the logged-in user only (Phase 19).
 * The user is always taken from the session — never from the request.
 */
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';

require_login();

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(["success" => false, "message" => "Method not allowed."]);
    exit();
}

$limit = intval($_GET['limit'] ?? 50);
if ($limit < 1 || $limit > 200) $limit = 50;
$unread_only = ($_GET['unread_only'] ?? '') === '1';

$database = new Database();
$conn = $database->connect();

$sql = "SELECT notification_id, event_key, title, message, link, is_read, created_at, read_at
        FROM notifications WHERE user_id = :user_id" . ($unread_only ? " AND is_read = 0" : "") . "
        ORDER BY created_at DESC, notification_id DESC LIMIT $limit";
$stmt = $conn->prepare($sql);
$stmt->execute([':user_id' => $_SESSION['user_id']]);

$count = $conn->prepare("SELECT COUNT(*) FROM notifications WHERE user_id = :user_id AND is_read = 0");
$count->execute([':user_id' => $_SESSION['user_id']]);

echo json_encode([
    "success" => true,
    "data" => $stmt->fetchAll(PDO::FETCH_ASSOC),
    "unread_count" => intval($count->fetchColumn()),
]);

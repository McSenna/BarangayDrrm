<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';

require_login(['admin']);

$data = json_decode(file_get_contents("php://input"), true);
$user_id = intval($data['user_id'] ?? 0);
$is_active = isset($data['is_active']) ? intval($data['is_active']) : null;

if ($user_id <= 0 || !in_array($is_active, [0, 1], true)) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "We couldn't update this account's status. Please refresh the page and try again."]);
    exit();
}

if ($user_id === intval($_SESSION['user_id']) && $is_active === 0) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "You cannot deactivate your own account while logged in."]);
    exit();
}

$database = new Database();
$conn = $database->connect();

$check = $conn->prepare("SELECT user_id FROM users WHERE user_id = :user_id");
$check->execute([':user_id' => $user_id]);
if (!$check->fetch()) {
    http_response_code(404);
    echo json_encode(["success" => false, "message" => "This account could not be found. Please refresh the page."]);
    exit();
}

$stmt = $conn->prepare("UPDATE users SET is_active = :is_active WHERE user_id = :user_id");
$stmt->execute([':is_active' => $is_active, ':user_id' => $user_id]);

log_action($conn, $is_active ? "User activated" : "User deactivated", "user_id: $user_id");

echo json_encode(["success" => true, "message" => $is_active ? "Account activated." : "Account deactivated."]);

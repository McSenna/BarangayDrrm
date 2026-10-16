<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';

require_login(); // any logged-in role — changing only their OWN password

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(["success" => false, "message" => "Method not allowed."]);
    exit();
}

$data = json_decode(file_get_contents("php://input"), true);
$current_password = $data['current_password'] ?? '';
$new_password = $data['new_password'] ?? '';

if ($current_password === '' || $new_password === '') {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "Current password and new password are required."]);
    exit();
}

if (strlen($new_password) < 6) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "New password must be at least 6 characters."]);
    exit();
}

$database = new Database();
$conn = $database->connect();
$user_id = $_SESSION['user_id'];

$stmt = $conn->prepare("SELECT password FROM users WHERE user_id = :user_id");
$stmt->execute([':user_id' => $user_id]);
$row = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$row || !password_verify($current_password, $row['password'])) {
    http_response_code(401);
    echo json_encode(["success" => false, "message" => "The current password you entered is incorrect. Please try again."]);
    exit();
}

$new_hash = password_hash($new_password, PASSWORD_DEFAULT);
$update = $conn->prepare("UPDATE users SET password = :password WHERE user_id = :user_id");
$update->execute([':password' => $new_hash, ':user_id' => $user_id]);

log_action($conn, "Password changed", "user_id: $user_id (self-service)");

echo json_encode(["success" => true, "message" => "Your password has been changed."]);

<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../users/registration.php';

if (!isset($_SESSION['user_id'])) {
    echo json_encode(["success" => true, "authenticated" => false]);
    exit();
}

// Re-check the account is still active in case an admin deactivated it
// after this session was created.
$database = new Database();
$conn = $database->connect();

$stmt = $conn->prepare("SELECT user_id, full_name, email, role, is_active FROM users WHERE user_id = :user_id");
$stmt->execute([':user_id' => $_SESSION['user_id']]);
$user = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$user || intval($user['is_active']) === 0 || registration_status($conn, $user['user_id']) !== 'approved') {
    $_SESSION = [];
    session_destroy();
    echo json_encode(["success" => true, "authenticated" => false, "message" => "Your account does not currently have access. Please contact the barangay office for assistance."]);
    exit();
}

echo json_encode([
    "success" => true,
    "authenticated" => true,
    "user" => [
        "user_id" => $user['user_id'],
        "full_name" => $user['full_name'],
        "email" => $user['email'],
        "role" => $user['role'],
    ]
]);

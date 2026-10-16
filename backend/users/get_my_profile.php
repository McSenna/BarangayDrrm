<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';

require_login(); // any logged-in role

$database = new Database();
$conn = $database->connect();

$stmt = $conn->prepare(
    "SELECT user_id, full_name, email, role, contact_number, is_active, created_at
     FROM users WHERE user_id = :user_id"
);
$stmt->execute([':user_id' => $_SESSION['user_id']]);
$user = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$user) {
    http_response_code(404);
    echo json_encode(["success" => false, "message" => "We couldn't load your profile. Please log in again."]);
    exit();
}

echo json_encode(["success" => true, "data" => $user]);

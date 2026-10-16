<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';

require_login(['admin']);

$data = json_decode(file_get_contents("php://input"), true);

$full_name = trim($data['full_name'] ?? '');
$email = trim($data['email'] ?? '');
$password = $data['password'] ?? '';
$role = $data['role'] ?? 'resident';
$contact_number = trim($data['contact_number'] ?? '');

if (!in_array($role, ['admin', 'resident', 'relief_personnel'])) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "The selected role is not valid. Please refresh the page and try again."]);
    exit();
}

if ($full_name === '' || $email === '' || strlen($password) < 6) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "Please enter the full name, email address, and a password of at least 6 characters."]);
    exit();
}

$database = new Database();
$conn = $database->connect();

$check = $conn->prepare("SELECT user_id FROM users WHERE email = :email");
$check->execute([':email' => $email]);
if ($check->fetch()) {
    http_response_code(409);
    echo json_encode(["success" => false, "message" => "An account with this email already exists."]);
    exit();
}

$stmt = $conn->prepare(
    "INSERT INTO users (full_name, email, password, role, contact_number)
     VALUES (:full_name, :email, :password, :role, :contact_number)"
);
$stmt->execute([
    ':full_name' => $full_name,
    ':email' => $email,
    ':password' => password_hash($password, PASSWORD_DEFAULT),
    ':role' => $role,
    ':contact_number' => $contact_number,
]);

// Phase 17 fix: capture the new user's ID before log_action() inserts into
// audit_logs (see disasters/create_report.php for the same bug pattern).
$new_user_id = $conn->lastInsertId();

log_action($conn, "User created by admin", "$role: $email");

http_response_code(201);
echo json_encode(["success" => true, "message" => "User created.", "user_id" => $new_user_id]);

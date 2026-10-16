<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';

require_login(['admin']);

$data = json_decode(file_get_contents("php://input"), true);
$user_id = intval($data['user_id'] ?? 0);

if ($user_id <= 0) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "We couldn't identify this account. Please refresh the page and try again."]);
    exit();
}

$role = $data['role'] ?? 'resident';
if (!in_array($role, ['admin', 'resident', 'relief_personnel'])) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "The selected role is not valid. Please refresh the page and try again."]);
    exit();
}

$full_name = trim($data['full_name'] ?? '');
$email = trim($data['email'] ?? '');
$contact_number = trim($data['contact_number'] ?? '');

if ($full_name === '' || $email === '') {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "Please enter the full name and email address."]);
    exit();
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "Please enter a valid email address."]);
    exit();
}

$database = new Database();
$conn = $database->connect();

// Make sure the email isn't already used by a DIFFERENT user
$check = $conn->prepare("SELECT user_id FROM users WHERE email = :email AND user_id != :user_id");
$check->execute([':email' => $email, ':user_id' => $user_id]);
if ($check->fetch()) {
    http_response_code(409);
    echo json_encode(["success" => false, "message" => "Another account already uses this email."]);
    exit();
}

if ($user_id === intval($_SESSION['user_id']) && $role !== 'admin') {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "You cannot change your own role while logged in."]);
    exit();
}

$stmt = $conn->prepare(
    "UPDATE users SET full_name = :full_name, email = :email, role = :role, contact_number = :contact_number WHERE user_id = :user_id"
);
$stmt->execute([
    ':full_name' => $full_name,
    ':email' => $email,
    ':role' => $role,
    ':contact_number' => $contact_number,
    ':user_id' => $user_id,
]);

log_action($conn, "User updated", "user_id: $user_id");

echo json_encode(["success" => true, "message" => "User updated."]);

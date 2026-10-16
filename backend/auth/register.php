<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(["success" => false, "message" => "Method not allowed."]);
    exit();
}

$data = json_decode(file_get_contents("php://input"), true);

$full_name = trim($data['full_name'] ?? '');
$email = trim($data['email'] ?? '');
$password = $data['password'] ?? '';
$contact_number = trim($data['contact_number'] ?? '');

// Public self-registration ALWAYS creates a Resident account (Phase 17 Security Fix 1).
// Any "role" sent by the client is ignored. Relief personnel and admin accounts are
// created only by an administrator (users/add_user.php) or setup_admin.php.
$role = 'resident';

if ($full_name === '' || $email === '' || $password === '') {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "Full name, email, and password are required."]);
    exit();
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "Please enter a valid email address."]);
    exit();
}

if (strlen($password) < 6) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "Password must be at least 6 characters."]);
    exit();
}

$database = new Database();
$conn = $database->connect();

// Check for duplicate email
$check = $conn->prepare("SELECT user_id FROM users WHERE email = :email");
$check->execute([':email' => $email]);
if ($check->fetch()) {
    http_response_code(409);
    echo json_encode(["success" => false, "message" => "An account with this email already exists."]);
    exit();
}

$hashed_password = password_hash($password, PASSWORD_DEFAULT);

$stmt = $conn->prepare(
    "INSERT INTO users (full_name, email, password, role, contact_number)
     VALUES (:full_name, :email, :password, :role, :contact_number)"
);

try {
    $stmt->execute([
        ':full_name' => $full_name,
        ':email' => $email,
        ':password' => $hashed_password,
        ':role' => $role,
        ':contact_number' => $contact_number,
    ]);

    $user_id = $conn->lastInsertId();
    log_action($conn, "User registered", "New $role account: $email");

    http_response_code(201);
    echo json_encode([
        "success" => true,
        "message" => "Registration successful. You may now log in.",
        "user_id" => $user_id
    ]);
} catch (PDOException $e) {
    http_response_code(500);
    error_log("auth/register.php: " . $e->getMessage());
    echo json_encode(["success" => false, "message" => "We couldn't complete your registration. Please try again."]);
}

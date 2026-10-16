<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(["success" => false, "message" => "Method not allowed."]);
    exit();
}

$data = json_decode(file_get_contents("php://input"), true);
$email = trim($data['email'] ?? '');
$password = $data['password'] ?? '';
$ip_address = $_SERVER['REMOTE_ADDR'] ?? null;

if ($email === '' || $password === '') {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "Email and password are required."]);
    exit();
}

$database = new Database();
$conn = $database->connect();

/** Records a login attempt (success or failure) to login_history. */
function record_login_attempt($conn, $user_id, $email, $status, $reason, $ip) {
    $stmt = $conn->prepare(
        "INSERT INTO login_history (user_id, email_attempted, login_status, failure_reason, ip_address)
         VALUES (:user_id, :email, :status, :reason, :ip)"
    );
    $stmt->execute([
        ':user_id' => $user_id, ':email' => $email, ':status' => $status,
        ':reason' => $reason, ':ip' => $ip,
    ]);
    return $conn->lastInsertId();
}

// Phase 25 (audit F-SEC-01): too many failed attempts for this e-mail address
// within the lock window -> refuse for a while (counted from login_history).
$max_fail = max(3, intval(app_config('LOGIN_MAX_FAILURES') ?: 8));
$lock_min = max(1, intval(app_config('LOGIN_LOCK_MINUTES') ?: 15));
$recent = $conn->prepare("SELECT COUNT(*) FROM login_history WHERE email_attempted = :e AND login_status = 'Failed'
                          AND login_at >= NOW() - INTERVAL $lock_min MINUTE AND login_at > COALESCE(
                              (SELECT MAX(login_at) FROM login_history WHERE email_attempted = :e2 AND login_status = 'Success'), '1970-01-01')");
$recent->execute([':e' => $email, ':e2' => $email]);
if (intval($recent->fetchColumn()) >= $max_fail) {
    record_login_attempt($conn, null, $email, 'Failed', 'Temporarily locked (too many failed attempts)', $ip_address);
    http_response_code(429);
    echo json_encode(["success" => false, "message" => "Too many failed sign-in attempts. Please wait $lock_min minutes and try again, or ask the Administrator to check your account."]);
    exit();
}

$stmt = $conn->prepare("SELECT user_id, full_name, email, password, role, is_active FROM users WHERE email = :email");
$stmt->execute([':email' => $email]);
$user = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$user || !password_verify($password, $user['password'])) {
    // Deliberately generic message (don't reveal whether the email exists) to
    // avoid account enumeration — but still record the real reason internally.
    record_login_attempt($conn, $user['user_id'] ?? null, $email, 'Failed',
        $user ? 'Incorrect password' : 'Unknown email', $ip_address);
    http_response_code(401);
    echo json_encode(["success" => false, "message" => "Invalid email or password."]);
    exit();
}

if (intval($user['is_active']) === 0) {
    record_login_attempt($conn, $user['user_id'], $email, 'Failed', 'Account deactivated', $ip_address);
    http_response_code(403);
    echo json_encode(["success" => false, "message" => "Your account has been deactivated. Please contact the barangay office for assistance."]);
    exit();
}

// Regenerate the session ID on every successful login — mitigates session
// fixation attacks (an attacker can't pre-set a session ID and have the
// victim's authenticated session adopt it).
session_regenerate_id(true);

$_SESSION['user_id'] = $user['user_id'];
$_SESSION['full_name'] = $user['full_name'];
$_SESSION['email'] = $user['email'];
$_SESSION['role'] = $user['role'];
$_SESSION['last_activity'] = time();
$_SESSION['login_history_id'] = record_login_attempt($conn, $user['user_id'], $email, 'Success', null, $ip_address);

log_action($conn, "User logged in", $user['email']);

echo json_encode([
    "success" => true,
    "message" => "Login successful.",
    "user" => [
        "user_id" => $user['user_id'],
        "full_name" => $user['full_name'],
        "email" => $user['email'],
        "role" => $user['role'],
    ]
]);

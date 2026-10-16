<?php
/**
 * One-time setup: creates the first admin account after importing the database.
 *
 * Phase 17 Security Fix 2 — COMMAND LINE ONLY. Web requests get 404.
 * Run it once from XAMPP Shell (or any terminal) inside the project folder:
 *
 *     php backend/setup_admin.php
 *
 * A random password is generated and printed ONCE in that terminal (there is
 * no default password any more). Log in with it, then change it immediately
 * under My Profile -> Change Password.
 *
 * It will NOT reset the password of an admin account that already exists. If
 * you genuinely need to reset a forgotten admin password, do it directly in
 * phpMyAdmin instead.
 */

// Refuse any web request (Apache, php -S, etc.) before touching the database.
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    header("Content-Type: text/plain");
    echo "Not found.";
    exit();
}

require_once __DIR__ . '/config/database.php';

$database = new Database();
$conn = $database->connect();

$email = "admin@binitayan.gov.ph";
// Random one-time password (16 hex characters) instead of a shared default.
$password = bin2hex(random_bytes(8));

$check = $conn->prepare("SELECT user_id FROM users WHERE email = :email");
$check->execute([':email' => $email]);
$existing = $check->fetch();

if ($existing) {
    echo "An admin account with this email already exists — password was NOT changed, for security.\n";
    echo "Email: $email\n";
    echo "If you've forgotten this account's password, reset it directly in phpMyAdmin\n";
    echo "using PHP's password_hash() output, not through this script.\n\n";
} else {
    $hash = password_hash($password, PASSWORD_DEFAULT);
    $stmt = $conn->prepare(
        "INSERT INTO users (full_name, email, password, role, contact_number)
         VALUES ('System Admin', :email, :password, 'admin', '09171234567')"
    );
    $stmt->execute([':email' => $email, ':password' => $hash]);
    echo "Admin account created.\n";
    echo "Email: $email\n";
    echo "Password: $password\n\n";
    echo "This password is shown only once. Log in and change it under My Profile -> Change Password.\n\n";
}

echo "This script only runs from the command line; it cannot be opened in a browser.\n";

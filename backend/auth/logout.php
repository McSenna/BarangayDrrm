<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';

// Record the logout timestamp on the matching login_history row, and log the
// action to the audit trail, before the session is destroyed.
if (isset($_SESSION['login_history_id'])) {
    $database = new Database();
    $conn = $database->connect();

    $conn->prepare("UPDATE login_history SET logout_at = NOW() WHERE history_id = :id")
        ->execute([':id' => $_SESSION['login_history_id']]);

    if (isset($_SESSION['email'])) {
        log_action($conn, "User logged out", $_SESSION['email']);
    }
}

$_SESSION = [];
session_destroy();

echo json_encode(["success" => true, "message" => "Logged out successfully."]);

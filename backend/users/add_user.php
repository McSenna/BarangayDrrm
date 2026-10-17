<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/management.php';
require_login(['admin']);
$conn = null;
try {
    $data = um_body('POST');
    $profile = um_profile($data, true);
    $conn = (new Database())->connect();
    um_lock($conn);
    $stmt = $conn->prepare('INSERT INTO users (full_name, email, role, contact_number, password) VALUES (?, ?, ?, ?, ?)');
    $stmt->execute([...array_values($profile), password_hash($data['password'], PASSWORD_DEFAULT)]);
    $id = intval($conn->lastInsertId());
    log_action($conn, 'User created by admin', "user_id: $id; role: {$profile['role']}");
    $conn->commit();
    http_response_code(201);
    echo json_encode(['success' => true, 'message' => 'User created.', 'user_id' => $id]);
} catch (Throwable $e) { um_error($e, $conn); }

<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../users/management.php';
$conn = null;
try {
    $data = um_body('POST');
    // Preserve public registration's fixed resident role. Client-supplied role,
    // activation and approval fields never influence the stored account.
    $profile = um_profile([
        'full_name' => $data['full_name'] ?? '', 'email' => $data['email'] ?? '',
        'password' => $data['password'] ?? '', 'contact_number' => $data['contact_number'] ?? '',
        'role' => 'resident',
    ], true);
    $conn = (new Database())->connect();
    if (!registration_ready($conn)) um_fail(503, 'Registration is temporarily unavailable. Please contact the barangay office.');
    $conn->beginTransaction();
    $stmt = $conn->prepare('INSERT INTO users (full_name, email, role, contact_number, password) VALUES (?, ?, ?, ?, ?)');
    $stmt->execute([...array_values($profile), password_hash($data['password'], PASSWORD_DEFAULT)]);
    $id = intval($conn->lastInsertId());
    $conn->prepare("INSERT INTO user_registration_requests (user_id, status) VALUES (?, 'pending')")->execute([$id]);
    log_action($conn, 'Registration requested', "user_id: $id; resident");
    $conn->commit();
    http_response_code(201);
    echo json_encode(['success' => true, 'message' => 'Registration submitted. Please wait for barangay approval before signing in.', 'user_id' => $id, 'registration_status' => 'pending']);
} catch (Throwable $e) { um_error($e, $conn); }

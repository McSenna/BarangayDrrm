<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/management.php';
require_login(['admin']);
$conn = null;
try {
    $data = um_body('POST');
    um_fields($data, ['user_id', 'is_active', 'version']);
    $id = um_id($data['user_id'] ?? null);
    $active = um_active($data['is_active'] ?? null);
    $conn = (new Database())->connect();
    $admins = um_lock($conn);
    $row = um_target($conn, $id, $data['version'] ?? null);
    if ($row['registration_status'] !== 'approved') um_fail(409, 'Registration approval is required before changing account activation.');
    um_guard($row, $_SESSION['user_id'], $row['role'], $active, $admins);
    $conn->prepare('UPDATE users SET is_active = ? WHERE user_id = ?')->execute([$active, $id]);
    log_action($conn, $active ? 'User activated' : 'User deactivated', "user_id: $id");
    $conn->commit();
    echo json_encode(['success' => true, 'message' => $active ? 'Account activated.' : 'Account deactivated.']);
} catch (Throwable $e) { um_error($e, $conn); }

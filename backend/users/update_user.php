<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/management.php';
require_login(['admin']);
$conn = null;
try {
    $data = um_body('PUT');
    $profile = um_profile($data);
    $id = um_id($data['user_id'] ?? null);
    $conn = (new Database())->connect();
    $admins = um_lock($conn);
    $row = um_target($conn, $id, $data['version'] ?? null);
    if ($row['registration_status'] !== 'approved') um_fail(409, 'Review this registration in Requests before editing its account.');
    um_guard($row, $_SESSION['user_id'], $profile['role'], intval($row['is_active']), $admins);
    $stmt = $conn->prepare('UPDATE users SET full_name = ?, email = ?, role = ?, contact_number = ? WHERE user_id = ?');
    $stmt->execute([...array_values($profile), $id]);
    log_action($conn, 'User updated', "user_id: $id; role: {$row['role']} -> {$profile['role']}");
    $conn->commit();
    echo json_encode(['success' => true, 'message' => 'User updated.']);
} catch (Throwable $e) { um_error($e, $conn); }

<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/management.php';
require_login(['admin']);
$conn = null;
try {
    $data = um_body('POST');
    um_fields($data, ['user_id', 'decision', 'version']);
    $id = um_id($data['user_id'] ?? null);
    $decision = $data['decision'] ?? null;
    if (!in_array($decision, ['approved', 'rejected'], true)) um_fail(400, 'Choose Approve or Reject.');
    if (!is_string($data['version'] ?? null) || $data['version'] === '') um_fail(400, 'Refresh the request before reviewing it.');
    $conn = (new Database())->connect();
    if (!registration_ready($conn)) um_fail(503, 'Registration requests are not available yet. Please contact the system administrator.');
    um_lock($conn);
    $row = um_target($conn, $id, $data['version']);
    if ($row['registration_status'] !== 'pending' || $row['role'] !== 'resident') um_fail(409, 'This registration has already been reviewed. Refresh Requests.');
    $stmt = $conn->prepare("UPDATE user_registration_requests SET status = ?, reviewed_at = CURRENT_TIMESTAMP, reviewed_by = ? WHERE user_id = ? AND status = 'pending'");
    $stmt->execute([$decision, $_SESSION['user_id'], $id]);
    if ($stmt->rowCount() !== 1) um_fail(409, 'This registration has already been reviewed. Refresh Requests.');
    log_action($conn, $decision === 'approved' ? 'Registration approved' : 'Registration rejected', "user_id: $id");
    $conn->commit();
    echo json_encode(['success' => true, 'message' => $decision === 'approved' ? 'Registration approved. The resident can now sign in.' : 'Registration rejected. The account cannot sign in.']);
} catch (Throwable $e) { um_error($e, $conn); }

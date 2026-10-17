<?php
// Approval is separate from is_active. No row means an existing/admin-created account.
function registration_ready(PDO $conn) {
    static $ready = null;
    if ($ready === null) {
        $stmt = $conn->query("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'user_registration_requests'");
        $ready = intval($stmt->fetchColumn()) === 1;
    }
    return $ready;
}
function registration_expression(PDO $conn, $userId = 'u.user_id') {
    return registration_ready($conn)
        ? "COALESCE((SELECT rr.status FROM user_registration_requests rr WHERE rr.user_id = $userId), 'approved')"
        : "'approved'";
}
function registration_status(PDO $conn, $userId) {
    if (!registration_ready($conn)) return 'approved';
    $stmt = $conn->prepare('SELECT status FROM user_registration_requests WHERE user_id = ?');
    $stmt->execute([$userId]);
    return $stmt->fetchColumn() ?: 'approved';
}
function registration_message($status) {
    return $status === 'pending'
        ? 'Your registration is pending barangay approval. Please wait for an administrator to review your request.'
        : 'Your registration request was rejected. Please contact the barangay office for assistance.';
}

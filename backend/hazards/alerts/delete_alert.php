<?php
/**
 * Delete an alert DRAFT that was never activated. Active and turned-off alerts are records and are never deleted
 * (Phase 33); turn an active alert off instead. Admin only.
 */
require_once __DIR__ . '/../../config/cors.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../lib/barangay_alerts.php';

require_login(['admin']);
ba_respond(function () {
    ba_require_method(['POST', 'DELETE']);
    $data = ba_json_body(['alert_id']);
    $conn = (new Database())->connect();
    ba_delete_draft($conn, ba_alert_id($data['alert_id'] ?? null), intval($_SESSION['user_id']));
    return [200, ['message' => 'Draft deleted.']];
});

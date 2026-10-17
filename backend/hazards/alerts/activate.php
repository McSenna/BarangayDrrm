<?php
/** Phase 33 — activate a Draft alert (it appears on the public map). Admin only. Sends no SMS or other notification. */
require_once __DIR__ . '/../../config/cors.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../lib/barangay_alerts.php';

require_login(['admin']);
ba_respond(function () {
    ba_require_method(['POST']);
    $data = ba_json_body(['alert_id']);
    $conn = (new Database())->connect();
    $r = ba_activate($conn, ba_alert_id($data['alert_id'] ?? null), intval($_SESSION['user_id']));
    $message = $r['already'] ? 'This alert is already active.' : 'Alert activated. It now appears on the barangay map.';
    return [200, ['message' => $message, 'already' => $r['already'], 'alert' => $r['alert']]];
});

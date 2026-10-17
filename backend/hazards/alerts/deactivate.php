<?php
/** Phase 33 — turn off an Active alert, with an optional resolution note. Admin only. The record and history are kept. */
require_once __DIR__ . '/../../config/cors.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../lib/barangay_alerts.php';

require_login(['admin']);
ba_respond(function () {
    ba_require_method(['POST']);
    $data = ba_json_body(['alert_id', 'resolution_note']);
    $conn = (new Database())->connect();
    $r = ba_deactivate($conn, ba_alert_id($data['alert_id'] ?? null), intval($_SESSION['user_id']), $data['resolution_note'] ?? null);
    $message = $r['already'] ? 'This alert was already turned off.' : 'Alert turned off. It no longer appears as an active alert on the barangay map.';
    return [200, ['message' => $message, 'already' => $r['already'], 'alert' => $r['alert']]];
});

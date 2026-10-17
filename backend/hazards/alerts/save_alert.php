<?php
/** Phase 33 — create a barangay alert as a Draft (POST) or edit a Draft / Active alert (PUT, needs version). Admin only. */
require_once __DIR__ . '/../../config/cors.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../lib/barangay_alerts.php';

require_login(['admin']);
ba_respond(function () {
    ba_require_method(['POST', 'PUT']);
    $data = ba_json_body();
    $conn = (new Database())->connect();
    $actor = intval($_SESSION['user_id']);
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $id = ba_create($conn, $data, $actor);
        return [201, ['message' => 'Alert saved as a draft. It is not shown to residents until you activate it.', 'alert' => ba_get($conn, $id)]];
    }
    $alert = ba_update($conn, ba_alert_id($data['alert_id'] ?? null), $data, $actor);
    $live = $alert['alert_status'] === 'Active' ? ' Open maps show the change at their next refresh.' : '';
    return [200, ['message' => 'Alert updated.' . $live, 'alert' => $alert]];
});

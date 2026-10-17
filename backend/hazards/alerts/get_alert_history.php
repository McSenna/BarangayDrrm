<?php
/** Phase 33 — one alert record with its full history (created, edits, activation, turn-off). Admin only. */
require_once __DIR__ . '/../../config/cors.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../lib/barangay_alerts.php';

require_login(['admin']);
ba_respond(function () {
    ba_require_method(['GET']);
    $conn = (new Database())->connect();
    $id = ba_alert_id($_GET['alert_id'] ?? null);
    $alert = ba_get($conn, $id);
    if (!$alert) ba_fail('The alert could not be found. It may have been removed.', 404);
    return [200, ['data' => ['alert' => $alert, 'history' => ba_history($conn, $id)]]];
});

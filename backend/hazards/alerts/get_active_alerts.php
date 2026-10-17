<?php
/**
 * Phase 33 — active barangay alerts for the public Home map and the staff map. Intentionally public (no login),
 * like hazards/get_public_status.php: resident-facing fields only, no administrator names or internal notes.
 * An empty list means no alert is active right now, not that an area is safe.
 */
require_once __DIR__ . '/../../config/cors.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../lib/barangay_alerts.php';

header('Cache-Control: no-store, max-age=0');
ba_respond(function () {
    ba_require_method(['GET']);
    $conn = (new Database())->connect();
    $alerts = ba_public_active($conn);
    return [200, ['data' => ['alerts' => $alerts, 'highest_severity' => ba_highest_severity($alerts), 'server_time' => (new DateTime('now', new DateTimeZone('Asia/Manila')))->format(DATE_ATOM)]]];
});

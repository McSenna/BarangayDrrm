<?php
/**
 * Older alert status call. Kept for compatibility, through the Phase 33 rules (backend/lib/barangay_alerts.php):
 *   { alert_id, resolve: true }  -> turn the alert off (idempotent, history kept)
 *   { alert_id, status }         -> change the severity of a Draft or Active alert
 * Admin only.
 */
require_once __DIR__ . '/../../config/cors.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../lib/barangay_alerts.php';

require_login(['admin']);
ba_respond(function () {
    ba_require_method(['POST']);
    $data = ba_json_body(['alert_id', 'status', 'resolve', 'resolution_note']);
    $id = ba_alert_id($data['alert_id'] ?? null);
    $conn = (new Database())->connect();
    $actor = intval($_SESSION['user_id']);
    if (!empty($data['resolve'])) {
        $r = ba_deactivate($conn, $id, $actor, $data['resolution_note'] ?? null);
        return [200, ['message' => $r['already'] ? 'This alert was already turned off.' : 'Hazard alert turned off.', 'alert' => $r['alert']]];
    }
    $current = ba_get($conn, $id);
    if (!$current) ba_fail('The alert could not be found. It may have been removed.', 404);
    $alert = ba_update($conn, $id, [
        'title' => $current['title'], 'hazard_type' => $current['hazard_type'], 'severity' => $data['status'] ?? null,
        'description' => $current['description'], 'instructions' => $current['instructions'],
        'scope' => $current['scope'], 'puroks' => $current['puroks'], 'version' => $current['version'],
    ], $actor);
    return [200, ['message' => 'Hazard alert severity updated.', 'alert' => $alert]];
});

<?php
/**
 * Older "issue hazard alert" call (one step, active at once). Kept for compatibility; it now goes through the
 * Phase 33 alert rules (backend/lib/barangay_alerts.php): saved as a draft and activated in one transaction,
 * so the record has the same history as alerts made on the Barangay Alerts page. Admin only.
 */
require_once __DIR__ . '/../../config/cors.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../lib/barangay_alerts.php';

require_login(['admin']);
ba_respond(function () {
    ba_require_method(['POST']);
    $data = ba_json_body(['hazard_type', 'status', 'title', 'description', 'affected_purok']);
    $purok = trim((string)($data['affected_purok'] ?? ''));
    $std = $purok === '' ? null : validate_purok_input($purok);
    if ($purok !== '' && $std === null) ba_fail('Please select a valid purok, or leave it empty for a barangay-wide alert.');
    $status = $data['status'] ?? 'Advisory';
    $content = [
        'title' => $data['title'] ?? '',
        'hazard_type' => ($data['hazard_type'] ?? '') === 'General Emergency' ? 'Other' : ($data['hazard_type'] ?? ''),
        'severity' => in_array($status, BA_SEVERITIES, true) ? $status : 'Advisory',
        'description' => $data['description'] ?? null,
        'scope' => $std ? 'puroks' : 'barangay',
        'puroks' => $std ? [$std] : [],
    ];
    $conn = (new Database())->connect();
    $actor = intval($_SESSION['user_id']);
    $id = ba_tx($conn, function () use ($conn, $content, $actor) {
        $id = ba_create($conn, $content, $actor);
        ba_activate($conn, $id, $actor);
        return $id;
    });
    return [201, ['message' => 'Hazard alert issued.', 'alert_id' => $id]];
});

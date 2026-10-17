<?php
/**
 * Barangay alert records for staff (Phase 33 via backend/lib/barangay_alerts.php). Administrators also see
 * drafts; Relief Personnel and Field Officers see active and turned-off alerts only, and purok-scoped staff
 * only those for their Purok or the whole barangay.
 * Filters: state (Draft|Active|Inactive), active_only (1|0), hazard_type, severity (or status), date_from, date_to.
 */
require_once __DIR__ . '/../../config/cors.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../lib/barangay_alerts.php';

require_login(['admin', 'relief_personnel', 'field_officer']);
ba_respond(function () {
    ba_require_method(['GET']);
    $conn = (new Database())->connect();
    $filters = array_map(fn($v) => is_string($v) ? $v : '', $_GET);
    if (!isset($filters['severity']) && isset($filters['status'])) $filters['severity'] = $filters['status'];
    $alerts = ba_list($conn, $filters, $_SESSION['role'] === 'admin');
    if (staff_has_purok_scope()) {
        $assigned = field_assigned_purok($conn);
        $alerts = array_values(array_filter($alerts, fn($a) => $a['scope'] === 'barangay' || in_array($assigned, $a['puroks'], true)));
    }
    return [200, ['data' => $alerts]];
});

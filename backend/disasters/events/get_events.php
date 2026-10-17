<?php
/** Phase 20 — list disaster events (with report and affected-area counts). */
require_once __DIR__ . '/../../config/cors.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../lib/affected_areas.php';

require_login(['admin', 'relief_personnel', 'field_officer']);

$conn = (new Database())->connect();
phase20_require_tables($conn);
$report_scope = staff_household_condition($conn, 'dr');

$rows = $conn->query(
    "SELECT e.*, u.full_name AS created_by_name,
            (SELECT COUNT(*) FROM disaster_reports dr
              WHERE $report_scope AND dr.report_date >= e.start_date AND dr.report_date <= COALESCE(e.end_date, CURDATE())) AS reports_in_period,
            (SELECT COUNT(*) FROM disaster_affected_areas a WHERE a.event_id = e.event_id) AS area_count,
            (SELECT COUNT(*) FROM disaster_affected_areas a WHERE a.event_id = e.event_id AND a.status = 'Active') AS active_area_count
     FROM disaster_events e LEFT JOIN users u ON u.user_id = e.created_by
     ORDER BY e.status ASC, e.start_date DESC, e.event_id DESC"
)->fetchAll(PDO::FETCH_ASSOC);

foreach ($rows as &$r) {
    foreach (['event_id', 'reports_in_period', 'area_count', 'active_area_count'] as $k) $r[$k] = intval($r[$k]);
}
echo json_encode(["success" => true, "data" => $rows]);

<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../lib/requests.php';
require_once __DIR__ . '/../lib/report_ref.php';
require_once __DIR__ . '/../sms/sms_helper.php';

require_login(['admin']);

$database = new Database();
$conn = $database->connect();

$total_households = $conn->query("SELECT COUNT(*) FROM households")->fetchColumn();
$total_residents = $conn->query("SELECT COUNT(*) FROM users WHERE role = 'resident'")->fetchColumn();
$total_reports = $conn->query("SELECT COUNT(*) FROM disaster_reports")->fetchColumn();
$total_relief_items = $conn->query("SELECT COALESCE(SUM(quantity),0) FROM relief_items")->fetchColumn();
$low_stock_count = $conn->query("SELECT COUNT(*) FROM relief_items WHERE quantity <= minimum_level")->fetchColumn();

$recent_reports = $conn->query(
    "SELECT dr.report_id, dr.disaster_type, dr.location, dr.severity, dr.status, dr.report_date, dr.created_at, u.full_name AS resident_name
     FROM disaster_reports dr
     JOIN users u ON dr.user_id = u.user_id
     ORDER BY dr.created_at DESC
     LIMIT 5"
)->fetchAll(PDO::FETCH_ASSOC);
$recent_reports = with_report_reference($recent_reports);

$low_stock_list = $conn->query(
    "SELECT item_id, item_name, category, quantity, unit, minimum_level
     FROM relief_items
     WHERE quantity <= minimum_level
     ORDER BY (quantity - minimum_level) ASC
     LIMIT 6"
)->fetchAll(PDO::FETCH_ASSOC);

$count_by = function (string $sql) use ($conn): array {
    $out = [];
    foreach ($conn->query($sql)->fetchAll(PDO::FETCH_ASSOC) as $r) $out[$r['k']] = intval($r['c']);
    return $out;
};

$workflow = [];
$workflow['households_without_coordinates'] = intval($conn->query("SELECT COUNT(*) FROM households WHERE latitude IS NULL OR longitude IS NULL")->fetchColumn());
$workflow['reports_by_status'] = $count_by("SELECT status AS k, COUNT(*) AS c FROM disaster_reports GROUP BY status");
$workflow['affected_households'] = intval($conn->query(
    "SELECT COUNT(DISTINCT household_id) FROM disaster_reports WHERE household_id IS NOT NULL AND status <> 'Rejected'"
)->fetchColumn());
$workflow['reports_without_assessment'] = intval($conn->query(
    "SELECT COUNT(*) FROM disaster_reports dr WHERE dr.status='Verified' AND NOT EXISTS (SELECT 1 FROM household_field_assessments fa WHERE fa.household_id=dr.household_id AND fa.status='assessed')"
)->fetchColumn());

// Households per priority (final score), plus Pending Assessment (no submitted visit) and For Verification (missing data).
$priority_levels = ['Critical Priority' => 0, 'High Priority' => 0, 'Moderate Priority' => 0, 'Low Priority' => 0, 'Pending Assessment' => 0, 'For Verification' => 0];
$needs_review = 0;
foreach (dss_priority_by_household() as $row) {
    if (isset($priority_levels[$row['priority_level']])) $priority_levels[$row['priority_level']]++;
    if (!empty($row['needs_review'])) $needs_review++;
}
$workflow['priority_levels'] = $priority_levels;
$workflow['dss_needs_review'] = $needs_review;

// Phase 23: incidents by severity (non-rejected reports) for the Hazard Monitoring card.
$workflow['incidents_by_severity'] = $count_by("SELECT severity AS k, COUNT(*) AS c FROM disaster_reports WHERE status <> 'Rejected' GROUP BY severity");

// Inventory shortage from the existing recommendation engine's item summary.
$recs = dss_run_endpoint('relief_recommendations.php');
$workflow['shortage_items'] = array_values(array_map(
    fn($i) => ['item_name' => $i['item_name'], 'unit' => $i['unit'], 'shortage' => intval($i['shortage']), 'available' => intval($i['available'])],
    array_filter($recs['item_summary'] ?? [], fn($i) => intval($i['shortage']) > 0)
));
$workflow['households_with_recommendations'] = count($recs['data'] ?? []);

$workflow['requests_by_status'] = $count_by("SELECT status AS k, COUNT(*) AS c FROM relief_requests GROUP BY status");
// Relief allocation workflow rounds by status (Pending Assessment … Completed / Cancelled).
$has_workflow_allocations = (bool) $conn->query("SHOW TABLES LIKE 'household_allocations'")->fetchColumn();
if ($has_workflow_allocations) {
    $workflow['allocations_by_status'] = $count_by("SELECT status AS k, COUNT(*) AS c FROM household_allocations GROUP BY status");
    $workflow['ready_for_distribution'] = intval($conn->query("SELECT COUNT(*) FROM household_allocations WHERE status = 'READY_FOR_DISTRIBUTION'")->fetchColumn());
} else {
    $workflow['allocations_by_status'] = $count_by("SELECT status AS k, COUNT(*) AS c FROM relief_allocations GROUP BY status");
    $has_ready_at = (bool) $conn->query("SHOW COLUMNS FROM relief_allocations LIKE 'ready_at'")->fetch();
    $workflow['ready_for_distribution'] = $has_ready_at
        ? intval($conn->query("SELECT COUNT(*) FROM relief_allocations WHERE status = 'Approved' AND ready_at IS NOT NULL")->fetchColumn())
        : null;
}
$workflow['deliveries_by_status'] = $count_by("SELECT status AS k, COUNT(*) AS c FROM distribution_beneficiaries GROUP BY status");
$workflow['upcoming_schedules'] = $conn->query(
    "SELECT ds.schedule_id, ds.distribution_date, ds.distribution_time, ds.location, rp.package_name, u.full_name AS assigned_personnel_name,
            (SELECT COUNT(*) FROM distribution_beneficiaries b WHERE b.schedule_id = ds.schedule_id) AS beneficiaries,
            (SELECT COUNT(*) FROM distribution_beneficiaries b WHERE b.schedule_id = ds.schedule_id AND b.status = 'Delivered') AS delivered
     FROM distribution_schedules ds
     JOIN relief_packages rp ON rp.package_id = ds.package_id
     LEFT JOIN users u ON u.user_id = ds.assigned_personnel
     WHERE ds.distribution_date >= CURDATE()
     ORDER BY ds.distribution_date ASC, ds.distribution_time ASC
     LIMIT 5"
)->fetchAll(PDO::FETCH_ASSOC);

$evac = $conn->query(
    "SELECT COUNT(*) AS centers, SUM(status = 'Open') AS open_centers, SUM(status = 'Full') AS full_centers,
            COALESCE(SUM(current_occupancy), 0) AS occupancy,
            COALESCE(SUM(CASE WHEN status <> 'Closed' THEN capacity ELSE 0 END), 0) AS capacity
     FROM evacuation_centers"
)->fetch(PDO::FETCH_ASSOC);
$workflow['evacuation'] = array_map('intval', $evac);

$workflow['active_alerts'] = $conn->query(
    "SELECT alert_id, hazard_type, status, title, affected_purok, issued_at FROM hazard_alerts WHERE is_active = 1
     ORDER BY FIELD(status, 'Critical','Warning','Alert','Normal'), issued_at DESC LIMIT 5"
)->fetchAll(PDO::FETCH_ASSOC);

$fb = $conn->query("SELECT COUNT(*) AS total, ROUND(AVG(rating), 2) AS average_rating, COALESCE(SUM(is_complaint), 0) AS complaints FROM relief_feedback")->fetch(PDO::FETCH_ASSOC);
$workflow['feedback'] = ['total' => intval($fb['total']), 'average_rating' => $fb['average_rating'] !== null ? floatval($fb['average_rating']) : null, 'complaints' => intval($fb['complaints'])];
$workflow['recent_feedback'] = $conn->query(
    "SELECT f.feedback_id, f.rating, f.received, f.is_complaint, f.comments, f.created_at, h.head_of_family
     FROM relief_feedback f JOIN households h ON h.household_id = f.household_id
     ORDER BY f.created_at DESC LIMIT 4"
)->fetchAll(PDO::FETCH_ASSOC);

// SMS readiness and last-7-day results; never expose the API key.
$sms_state = sms_config_state();
$workflow['sms'] = [
    'configured' => $sms_state['ready'],
    'last_7_days' => $count_by("SELECT status AS k, COUNT(*) AS c FROM sms_logs WHERE sent_at >= NOW() - INTERVAL 7 DAY GROUP BY status"),
    'failed_total' => intval($conn->query("SELECT COUNT(*) FROM sms_logs WHERE status = 'Failed'")->fetchColumn()),
];

$workflow['recent_activity'] = $conn->query(
    "SELECT a.action, a.created_at, u.full_name FROM audit_logs a LEFT JOIN users u ON u.user_id = a.user_id
     WHERE a.action NOT IN ('User logged in', 'User logged out')
     ORDER BY a.created_at DESC, a.log_id DESC LIMIT 8"
)->fetchAll(PDO::FETCH_ASSOC);

echo json_encode([
    "success" => true,
    "data" => [
        "total_households" => intval($total_households),
        "total_residents" => intval($total_residents),
        "total_disaster_reports" => intval($total_reports),
        "total_relief_items" => intval($total_relief_items),
        "low_stock_items" => intval($low_stock_count),
        "low_stock_list" => $low_stock_list,
        "recent_reports" => $recent_reports,
        "workflow" => $workflow,
    ]
]);

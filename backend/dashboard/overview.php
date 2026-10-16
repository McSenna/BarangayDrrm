<?php
/**
 * Administrator Dashboard — filtered overview.
 *
 * GET params (all optional):
 *   range     7d | 30d | 90d | 12m | all   (default 30d)
 *   purok     one of BINITAYAN_PUROKS        (default: every Purok)
 *   event_id  a disaster_events.event_id     (default: every event)
 *
 * The period, Purok and event scope the overview figures, the reports chart,
 * the relief pipeline and the work queue. DSS priorities describe the current
 * state of each household, so they follow the Purok filter only. Evacuation
 * centers are barangay-wide. Every figure is a direct count; nothing is
 * estimated. Read-only.
 */
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../lib/dss.php';
require_once __DIR__ . '/../lib/puroks.php';
require_once __DIR__ . '/../lib/report_ref.php';

require_login(['admin']);

$conn = (new Database())->connect();

// ---------------------------------------------------------------------------
// Filters (anything not on the allowed lists falls back to the default)
// ---------------------------------------------------------------------------
$RANGES = ['7d' => 7, '30d' => 30, '90d' => 90, '12m' => 365, 'all' => null];
$range = isset($_GET['range']) && array_key_exists($_GET['range'], $RANGES) ? $_GET['range'] : '30d';
$purok = isset($_GET['purok']) && in_array($_GET['purok'], BINITAYAN_PUROKS, true) ? $_GET['purok'] : '';
$event_id = isset($_GET['event_id']) && ctype_digit((string) $_GET['event_id']) ? intval($_GET['event_id']) : 0;

$today = new DateTimeImmutable('today');
if ($RANGES[$range] !== null) {
    $from = $today->modify('-' . ($RANGES[$range] - 1) . ' days');
} else {
    $earliest = $conn->query("SELECT MIN(report_date) FROM disaster_reports")->fetchColumn();
    $from = $earliest ? new DateTimeImmutable($earliest) : $today->modify('-29 days');
}
$from_sql = $from->format('Y-m-d');

/** WHERE fragments + params shared by every report query (alias dr, households h). */
$report_where = ["dr.report_date >= :from"];
$report_params = [':from' => $from_sql];
if ($purok !== '') { $report_where[] = "h.purok = :purok"; $report_params[':purok'] = $purok; }
if ($event_id) { $report_where[] = "dr.event_id = :event_id"; $report_params[':event_id'] = $event_id; }
$report_from = "FROM disaster_reports dr LEFT JOIN households h ON h.household_id = dr.household_id WHERE " . implode(' AND ', $report_where);

/** Same for allocations (alias a, households h). */
$alloc_where = ["a.allocation_date >= :from"];
$alloc_params = [':from' => $from_sql];
if ($purok !== '') { $alloc_where[] = "h.purok = :purok"; $alloc_params[':purok'] = $purok; }
if ($event_id) { $alloc_where[] = "a.event_id = :event_id"; $alloc_params[':event_id'] = $event_id; }
$alloc_from = "FROM relief_allocations a JOIN households h ON h.household_id = a.household_id
               LEFT JOIN relief_items i ON i.item_id = a.item_id WHERE " . implode(' AND ', $alloc_where);

$run = function (string $sql, array $params) use ($conn) {
    $stmt = $conn->prepare($sql);
    $stmt->execute($params);
    return $stmt;
};

// ---------------------------------------------------------------------------
// Filter options
// ---------------------------------------------------------------------------
$events = $conn->query(
    "SELECT event_id, event_name, disaster_type, status, start_date, end_date FROM disaster_events
     ORDER BY status ASC, start_date DESC, event_id DESC"
)->fetchAll(PDO::FETCH_ASSOC);
foreach ($events as &$e) $e['event_id'] = intval($e['event_id']);
unset($e);

// ---------------------------------------------------------------------------
// Reports: overview figures, queue and chart
// ---------------------------------------------------------------------------
$report_counts = $run(
    "SELECT
        SUM(dr.status = 'Pending') AS pending,
        SUM(dr.status = 'Pending' AND dr.severity IN ('Critical', 'High')) AS pending_urgent,
        SUM(dr.status <> 'Rejected') AS total,
        COUNT(DISTINCT CASE WHEN dr.status <> 'Rejected' THEN dr.household_id END) AS affected_households
     $report_from",
    $report_params
)->fetch(PDO::FETCH_ASSOC);

$without_assessment = intval($run(
    "SELECT COUNT(*) $report_from AND dr.status = 'Verified'
       AND NOT EXISTS (SELECT 1 FROM damage_assessments da WHERE da.report_id = dr.report_id)",
    $report_params
)->fetchColumn());

$queue_reports = with_report_reference($run(
    "SELECT dr.report_id, dr.created_at, dr.report_date, dr.disaster_type, dr.severity, dr.status, dr.location,
            dr.household_id, h.head_of_family, h.purok
     $report_from AND dr.status = 'Pending'
     ORDER BY FIELD(dr.severity, 'Critical', 'High', 'Medium', 'Low'), dr.created_at DESC
     LIMIT 100",
    $report_params
)->fetchAll(PDO::FETCH_ASSOC));
foreach ($queue_reports as &$r) {
    $r['report_id'] = intval($r['report_id']);
    $r['household_id'] = $r['household_id'] !== null ? intval($r['household_id']) : null;
}
unset($r);

// Chart buckets: days up to 30 days, weeks up to 90 days, months beyond.
$span_days = $from->diff($today)->days + 1;
$granularity = $span_days <= 31 ? 'day' : ($span_days <= 92 ? 'week' : 'month');
$bucket_of = function (string $date) use ($granularity, $from): string {
    $d = new DateTimeImmutable($date);
    if ($granularity === 'day') return $d->format('Y-m-d');
    if ($granularity === 'month') return $d->format('Y-m');
    $offset = intdiv($from->diff($d)->days, 7);
    return $from->modify('+' . ($offset * 7) . ' days')->format('Y-m-d');
};

$buckets = [];
$cursor = $granularity === 'month' ? $from->modify('first day of this month') : $from;
while ($cursor <= $today) {
    $key = $granularity === 'month' ? $cursor->format('Y-m') : $cursor->format('Y-m-d');
    $buckets[$key] = ['key' => $key, 'Critical' => 0, 'High' => 0, 'Medium' => 0, 'Low' => 0, 'alerts' => 0];
    $cursor = $cursor->modify($granularity === 'day' ? '+1 day' : ($granularity === 'week' ? '+7 days' : '+1 month'));
}

$by_day = $run(
    "SELECT dr.report_date AS d, dr.severity AS s, COUNT(*) AS c $report_from AND dr.status <> 'Rejected'
     GROUP BY dr.report_date, dr.severity",
    $report_params
)->fetchAll(PDO::FETCH_ASSOC);
foreach ($by_day as $row) {
    $key = $bucket_of($row['d']);
    if (isset($buckets[$key][$row['s']])) $buckets[$key][$row['s']] += intval($row['c']);
}

// Hazard alerts issued in the period (Purok filter: that Purok or barangay-wide).
$alert_sql = "SELECT alert_id, hazard_type, status, title, affected_purok, issued_at, is_active
              FROM hazard_alerts WHERE DATE(issued_at) >= :from";
$alert_params = [':from' => $from_sql];
if ($purok !== '') {
    $alert_sql .= " AND (affected_purok IS NULL OR affected_purok = '' OR affected_purok = :purok)";
    $alert_params[':purok'] = $purok;
}
$alerts_in_period = $run($alert_sql . " ORDER BY issued_at ASC", $alert_params)->fetchAll(PDO::FETCH_ASSOC);
foreach ($alerts_in_period as &$a) {
    $a['alert_id'] = intval($a['alert_id']);
    $a['is_active'] = (bool) $a['is_active'];
    $a['bucket'] = $bucket_of(substr($a['issued_at'], 0, 10));
    if (isset($buckets[$a['bucket']])) $buckets[$a['bucket']]['alerts']++;
}
unset($a);

// ---------------------------------------------------------------------------
// Relief allocations: pipeline and queue
// ---------------------------------------------------------------------------
$has_ready = (bool) $conn->query("SHOW COLUMNS FROM relief_allocations LIKE 'ready_at'")->fetch();
$ready_expr = $has_ready ? "a.ready_at IS NOT NULL" : "0";

$pipe = $run(
    "SELECT
        SUM(a.status = 'Pending') AS pending,
        SUM(a.status = 'Approved' AND NOT ($ready_expr)) AS approved,
        SUM(a.status = 'Approved' AND ($ready_expr)) AS ready,
        SUM(a.status = 'Distributed') AS distributed,
        COUNT(DISTINCT CASE WHEN a.status = 'Distributed' THEN a.household_id END) AS households_served
     $alloc_from",
    $alloc_params
)->fetch(PDO::FETCH_ASSOC);

$queue_allocations = $run(
    "SELECT a.allocation_id, a.household_id, a.quantity, a.status, a.allocation_date, a.approved_at,
            ($ready_expr) AS is_ready, a.is_emergency_override, a.dss_category,
            h.head_of_family, h.purok, i.item_name, i.unit
     $alloc_from AND a.status IN ('Pending', 'Approved')
     ORDER BY FIELD(a.status, 'Pending', 'Approved'), ($ready_expr) ASC, a.allocation_date DESC, a.allocation_id DESC
     LIMIT 100",
    $alloc_params
)->fetchAll(PDO::FETCH_ASSOC);
foreach ($queue_allocations as &$q) {
    foreach (['allocation_id', 'household_id', 'quantity'] as $k) $q[$k] = intval($q[$k]);
    $q['is_ready'] = (bool) $q['is_ready'];
    $q['is_emergency_override'] = (bool) $q['is_emergency_override'];
}
unset($q);

// ---------------------------------------------------------------------------
// DSS priorities (current state; Purok filter only)
// ---------------------------------------------------------------------------
$prio = ['Critical Priority' => 0, 'High Priority' => 0, 'Moderate Priority' => 0, 'Low Priority' => 0, 'Not Assessed' => 0];
$needs_review = 0;
$queue_priorities = [];
foreach (dss_compute_priorities_cached($conn) as $row) {
    if ($purok !== '' && purok_match_key($row['purok']) !== $purok) continue;
    if (isset($prio[$row['priority_level']])) $prio[$row['priority_level']]++;
    if (!empty($row['eligible']) && !empty($row['needs_review'])) $needs_review++;
    if (!empty($row['eligible']) && in_array($row['priority_level'], ['Critical Priority', 'High Priority'], true)) {
        $queue_priorities[] = [
            'household_id' => intval($row['household_id']),
            'head_of_family' => $row['head_of_family'],
            'purok' => $row['purok'],
            'rank' => $row['rank'],
            'priority_score' => $row['priority_score'],
            'priority_level' => $row['priority_level'],
            'latest_severity' => $row['latest_severity'],
            'needs_review' => (bool) $row['needs_review'],
            'has_damage_assessment' => (bool) $row['has_damage_assessment'],
            'current_relief_status' => $row['current_relief_status'],
            'report_date' => $row['report_date'] ?? null,
        ];
    }
}

// ---------------------------------------------------------------------------
// Evacuation centers (barangay-wide)
// ---------------------------------------------------------------------------
$centers = $conn->query(
    "SELECT center_id, name, purok, status, capacity, current_occupancy FROM evacuation_centers
     WHERE status <> 'Closed' ORDER BY FIELD(status, 'Full', 'Open'), name ASC"
)->fetchAll(PDO::FETCH_ASSOC);
foreach ($centers as &$c) {
    foreach (['center_id', 'capacity', 'current_occupancy'] as $k) $c[$k] = intval($c[$k]);
}
unset($c);

$i = fn($v) => intval($v ?? 0);

echo json_encode([
    "success" => true,
    "data" => [
        "filters" => [
            "range" => $range,
            "purok" => $purok,
            "event_id" => $event_id ?: null,
            "from" => $from_sql,
            "to" => $today->format('Y-m-d'),
        ],
        "options" => ["puroks" => BINITAYAN_PUROKS, "events" => $events],
        "reports" => [
            "pending" => $i($report_counts['pending']),
            "pending_urgent" => $i($report_counts['pending_urgent']),
            "total" => $i($report_counts['total']),
            "affected_households" => $i($report_counts['affected_households']),
            "without_assessment" => $without_assessment,
        ],
        "priorities" => [
            "levels" => $prio,
            "needs_review" => $needs_review,
        ],
        "pipeline" => [
            "pending" => $i($pipe['pending']),
            "approved" => $i($pipe['approved']),
            "ready" => $i($pipe['ready']),
            "distributed" => $i($pipe['distributed']),
            "households_served" => $i($pipe['households_served']),
        ],
        "series" => [
            "granularity" => $granularity,
            "buckets" => array_values($buckets),
            "alerts" => $alerts_in_period,
        ],
        "queue" => [
            "reports" => $queue_reports,
            "priorities" => $queue_priorities,
            "allocations" => $queue_allocations,
        ],
        "centers" => $centers,
        // Highest IDs overall (unfiltered): the dashboard's "new since last visit" watermark.
        "latest_ids" => [
            "reports" => intval($conn->query("SELECT COALESCE(MAX(report_id), 0) FROM disaster_reports")->fetchColumn()),
            "allocations" => intval($conn->query("SELECT COALESCE(MAX(allocation_id), 0) FROM relief_allocations")->fetchColumn()),
        ],
    ],
]);

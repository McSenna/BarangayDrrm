<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';

require_login(['admin']);

$database = new Database();
$conn = $database->connect();

$date_from = $_GET['date_from'] ?? '';
$date_to = $_GET['date_to'] ?? '';
$purok = $_GET['purok'] ?? '';
$disaster_type = $_GET['disaster_type'] ?? '';
$severity = $_GET['severity'] ?? '';

$where = "WHERE 1=1";
$params = [];

if ($date_from !== '') { $where .= " AND dr.report_date >= :date_from"; $params[':date_from'] = $date_from; }
if ($date_to !== '') { $where .= " AND dr.report_date <= :date_to"; $params[':date_to'] = $date_to; }
if ($purok !== '') { $where .= " AND h.purok = :purok"; $params[':purok'] = $purok; }
if ($disaster_type !== '') {
    // No longer a fixed whitelist (Phase 14: disaster types are admin-managed).
    $where .= " AND dr.disaster_type = :disaster_type"; $params[':disaster_type'] = $disaster_type;
}
if (in_array($severity, ['Low', 'Medium', 'High', 'Critical'])) {
    $where .= " AND dr.severity = :severity"; $params[':severity'] = $severity;
}

$base_from = "FROM disaster_reports dr LEFT JOIN households h ON dr.household_id = h.household_id";

$total_stmt = $conn->prepare("SELECT COUNT(*) $base_from $where");
$total_stmt->execute($params);
$total = intval($total_stmt->fetchColumn());

$by_type_stmt = $conn->prepare("SELECT dr.disaster_type AS label, COUNT(*) AS count $base_from $where GROUP BY dr.disaster_type ORDER BY count DESC");
$by_type_stmt->execute($params);
$by_type = $by_type_stmt->fetchAll(PDO::FETCH_ASSOC);

$by_severity_stmt = $conn->prepare("SELECT dr.severity AS label, COUNT(*) AS count $base_from $where GROUP BY dr.severity ORDER BY FIELD(dr.severity,'Critical','High','Medium','Low')");
$by_severity_stmt->execute($params);
$by_severity = $by_severity_stmt->fetchAll(PDO::FETCH_ASSOC);

$by_purok_stmt = $conn->prepare("SELECT COALESCE(h.purok, 'Unlinked') AS label, COUNT(*) AS count $base_from $where GROUP BY label ORDER BY count DESC");
$by_purok_stmt->execute($params);
$by_purok = $by_purok_stmt->fetchAll(PDO::FETCH_ASSOC);

$by_status_stmt = $conn->prepare("SELECT dr.status AS label, COUNT(*) AS count $base_from $where GROUP BY dr.status");
$by_status_stmt->execute($params);
$by_status = $by_status_stmt->fetchAll(PDO::FETCH_ASSOC);

$by_date_stmt = $conn->prepare("SELECT DATE_FORMAT(dr.report_date, '%Y-%m') AS label, COUNT(*) AS count $base_from $where GROUP BY label ORDER BY label ASC");
$by_date_stmt->execute($params);
$by_date = $by_date_stmt->fetchAll(PDO::FETCH_ASSOC);

$puroks_stmt = $conn->query("SELECT DISTINCT purok FROM households ORDER BY purok ASC");
$puroks = $puroks_stmt->fetchAll(PDO::FETCH_COLUMN);

echo json_encode([
    "success" => true,
    "data" => [
        "total_reports" => $total,
        "by_type" => $by_type,
        "by_severity" => $by_severity,
        "by_purok" => $by_purok,
        "by_status" => $by_status,
        "by_month" => $by_date,
        "available_puroks" => $puroks,
    ]
]);

<?php
require_once __DIR__ . '/../../config/cors.php';
require_once __DIR__ . '/../../config/database.php';

require_login(['admin', 'relief_personnel']);

$database = new Database();
$conn = $database->connect();

$status = $_GET['status'] ?? ''; // filters by whether ALL beneficiaries share this status is too strict; instead we filter schedules containing at least one beneficiary in this status
$date_from = $_GET['date_from'] ?? '';
$date_to = $_GET['date_to'] ?? '';

$sql = "SELECT ds.*, rp.package_name, u.full_name AS assigned_personnel_name, c.full_name AS created_by_name
        FROM distribution_schedules ds
        JOIN relief_packages rp ON ds.package_id = rp.package_id
        LEFT JOIN users u ON ds.assigned_personnel = u.user_id
        LEFT JOIN users c ON ds.created_by = c.user_id
        WHERE 1=1";
$params = [];

// Relief personnel only see schedules assigned to them
if ($_SESSION['role'] === 'relief_personnel') {
    $sql .= " AND ds.assigned_personnel = :user_id";
    $params[':user_id'] = $_SESSION['user_id'];
}

if ($date_from !== '') {
    $sql .= " AND ds.distribution_date >= :date_from";
    $params[':date_from'] = $date_from;
}
if ($date_to !== '') {
    $sql .= " AND ds.distribution_date <= :date_to";
    $params[':date_to'] = $date_to;
}

$sql .= " ORDER BY ds.distribution_date DESC, ds.distribution_time DESC";

$stmt = $conn->prepare($sql);
$stmt->execute($params);
$schedules = $stmt->fetchAll(PDO::FETCH_ASSOC);

// Attach a beneficiary status-count summary to each schedule
$count_stmt = $conn->prepare(
    "SELECT status, COUNT(*) AS c FROM distribution_beneficiaries WHERE schedule_id = :schedule_id GROUP BY status"
);

foreach ($schedules as &$s) {
    $count_stmt->execute([':schedule_id' => $s['schedule_id']]);
    $counts = ['Pending' => 0, 'Prepared' => 0, 'Dispatched' => 0, 'Delivered' => 0, 'Cancelled' => 0];
    foreach ($count_stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $counts[$row['status']] = intval($row['c']);
    }
    $s['beneficiary_counts'] = $counts;
    $s['total_beneficiaries'] = array_sum($counts);
}

// Optional post-filter: only schedules that have at least one beneficiary in the requested status
if (in_array($status, ['Pending', 'Prepared', 'Dispatched', 'Delivered', 'Cancelled'])) {
    $schedules = array_values(array_filter($schedules, fn($s) => $s['beneficiary_counts'][$status] > 0));
}

echo json_encode(["success" => true, "data" => $schedules]);

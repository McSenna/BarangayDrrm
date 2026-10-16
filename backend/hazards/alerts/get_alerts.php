<?php
require_once __DIR__ . '/../../config/cors.php';
require_once __DIR__ . '/../../config/database.php';

require_login(['admin', 'relief_personnel']); // Phase 21: staff only (residents no longer use this data)

$database = new Database();
$conn = $database->connect();

$hazard_type = $_GET['hazard_type'] ?? '';
$status = $_GET['status'] ?? '';
$active_only = $_GET['active_only'] ?? '';
$date_from = $_GET['date_from'] ?? '';
$date_to = $_GET['date_to'] ?? '';

$sql = "SELECT ha.*, i.full_name AS issued_by_name, r.full_name AS resolved_by_name
        FROM hazard_alerts ha
        LEFT JOIN users i ON ha.issued_by = i.user_id
        LEFT JOIN users r ON ha.resolved_by = r.user_id
        WHERE 1=1";
$params = [];

if (in_array($hazard_type, ['Flood', 'Typhoon', 'Landslide', 'General Emergency'])) {
    $sql .= " AND ha.hazard_type = :hazard_type";
    $params[':hazard_type'] = $hazard_type;
}
if (in_array($status, ['Normal', 'Alert', 'Warning', 'Critical'])) {
    $sql .= " AND ha.status = :status";
    $params[':status'] = $status;
}
if ($active_only === '1') {
    $sql .= " AND ha.is_active = 1";
} elseif ($active_only === '0') {
    $sql .= " AND ha.is_active = 0";
}
if ($date_from !== '') {
    $sql .= " AND DATE(ha.issued_at) >= :date_from";
    $params[':date_from'] = $date_from;
}
if ($date_to !== '') {
    $sql .= " AND DATE(ha.issued_at) <= :date_to";
    $params[':date_to'] = $date_to;
}

$sql .= " ORDER BY ha.is_active DESC, ha.issued_at DESC";

$stmt = $conn->prepare($sql);
$stmt->execute($params);

echo json_encode(["success" => true, "data" => $stmt->fetchAll(PDO::FETCH_ASSOC)]);

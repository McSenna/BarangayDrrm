<?php
require_once __DIR__ . '/../../config/cors.php';
require_once __DIR__ . '/../../config/database.php';

require_login(['admin', 'relief_personnel', 'field_officer']); // Phase 21: staff only (residents no longer use this data)

$database = new Database();
$conn = $database->connect();

$date_from = $_GET['date_from'] ?? '';
$date_to = $_GET['date_to'] ?? '';

$sql = "SELECT wl.*, u.full_name AS recorded_by_name
        FROM weather_logs wl
        LEFT JOIN users u ON wl.recorded_by = u.user_id
        WHERE 1=1";
$params = [];

if ($date_from !== '') {
    $sql .= " AND wl.log_date >= :date_from";
    $params[':date_from'] = $date_from;
}
if ($date_to !== '') {
    $sql .= " AND wl.log_date <= :date_to";
    $params[':date_to'] = $date_to;
}

$sql .= " ORDER BY wl.log_date DESC, wl.log_time DESC LIMIT 200";

$stmt = $conn->prepare($sql);
$stmt->execute($params);

echo json_encode(["success" => true, "data" => $stmt->fetchAll(PDO::FETCH_ASSOC)]);

<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';

require_login(['admin', 'relief_personnel']);

$database = new Database();
$conn = $database->connect();

$item_id = $_GET['item_id'] ?? '';
$log_type = $_GET['log_type'] ?? '';
$date_from = $_GET['date_from'] ?? '';
$date_to = $_GET['date_to'] ?? '';

$sql = "SELECT il.*, ri.item_name, ri.unit, u.full_name AS performed_by_name
        FROM inventory_logs il
        JOIN relief_items ri ON il.item_id = ri.item_id
        LEFT JOIN users u ON il.performed_by = u.user_id
        WHERE 1=1";
$params = [];

if ($item_id !== '') {
    $sql .= " AND il.item_id = :item_id";
    $params[':item_id'] = intval($item_id);
}
if (in_array($log_type, ['Stock In', 'Stock Out', 'Adjustment', 'Donation'])) {
    $sql .= " AND il.log_type = :log_type";
    $params[':log_type'] = $log_type;
}
if ($date_from !== '') {
    $sql .= " AND DATE(il.created_at) >= :date_from";
    $params[':date_from'] = $date_from;
}
if ($date_to !== '') {
    $sql .= " AND DATE(il.created_at) <= :date_to";
    $params[':date_to'] = $date_to;
}

$sql .= " ORDER BY il.created_at DESC LIMIT 300";

$stmt = $conn->prepare($sql);
$stmt->execute($params);

echo json_encode(["success" => true, "data" => $stmt->fetchAll(PDO::FETCH_ASSOC)]);

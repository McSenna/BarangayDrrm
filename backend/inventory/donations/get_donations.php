<?php
require_once __DIR__ . '/../../config/cors.php';
require_once __DIR__ . '/../../config/database.php';

require_login(['admin', 'relief_personnel']);

$database = new Database();
$conn = $database->connect();

$item_id = $_GET['item_id'] ?? '';
$date_from = $_GET['date_from'] ?? '';
$date_to = $_GET['date_to'] ?? '';

$sql = "SELECT d.*, ri.item_name, ri.unit, u.full_name AS recorded_by_name
        FROM donations d
        JOIN relief_items ri ON d.item_id = ri.item_id
        LEFT JOIN users u ON d.recorded_by = u.user_id
        WHERE 1=1";
$params = [];

if ($item_id !== '') {
    $sql .= " AND d.item_id = :item_id";
    $params[':item_id'] = intval($item_id);
}
if ($date_from !== '') {
    $sql .= " AND d.donation_date >= :date_from";
    $params[':date_from'] = $date_from;
}
if ($date_to !== '') {
    $sql .= " AND d.donation_date <= :date_to";
    $params[':date_to'] = $date_to;
}

$sql .= " ORDER BY d.donation_date DESC, d.donation_id DESC";

$stmt = $conn->prepare($sql);
$stmt->execute($params);

echo json_encode(["success" => true, "data" => $stmt->fetchAll(PDO::FETCH_ASSOC)]);

<?php
require_once __DIR__ . '/../../config/cors.php';
require_once __DIR__ . '/../../config/database.php';

require_login(['admin', 'relief_personnel']); // Phase 21: staff only (residents no longer use this data)

$database = new Database();
$conn = $database->connect();

$active_only = $_GET['active_only'] ?? '1'; // default: only active categories

$sql = "SELECT category_id, category_name, is_active FROM inventory_categories";
if ($active_only === '1') {
    $sql .= " WHERE is_active = 1";
}
$sql .= " ORDER BY category_name ASC";

$stmt = $conn->query($sql);
echo json_encode(["success" => true, "data" => $stmt->fetchAll(PDO::FETCH_ASSOC)]);

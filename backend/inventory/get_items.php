<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';

require_login(['admin', 'relief_personnel']); // Phase 21: staff only (residents no longer use this data)

$database = new Database();
$conn = $database->connect();

// committed_quantity = approved but not yet distributed (read-only, for display;
// stock_out.php and adjust_quantity.php enforce it on the server).
$stmt = $conn->query(
    "SELECT ri.*,
            COALESCE((SELECT SUM(ra.quantity) FROM relief_allocations ra
                      WHERE ra.item_id = ri.item_id AND ra.status = 'Approved'), 0) AS committed_quantity
     FROM relief_items ri
     ORDER BY ri.item_name ASC"
);
$items = $stmt->fetchAll(PDO::FETCH_ASSOC);

foreach ($items as &$item) {
    $item['low_stock'] = intval($item['quantity']) <= intval($item['minimum_level']);
}

echo json_encode(["success" => true, "data" => $items]);

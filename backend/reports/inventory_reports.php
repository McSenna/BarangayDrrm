<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';

require_login(['admin']);

$database = new Database();
$conn = $database->connect();

$date_from = $_GET['date_from'] ?? '';
$date_to = $_GET['date_to'] ?? '';

$date_where = "WHERE 1=1";
$params = [];
if ($date_from !== '') { $date_where .= " AND DATE(il.created_at) >= :date_from"; $params[':date_from'] = $date_from; }
if ($date_to !== '') { $date_where .= " AND DATE(il.created_at) <= :date_to"; $params[':date_to'] = $date_to; }

$current_inventory = $conn->query(
    "SELECT item_id, item_name, category, quantity, unit, minimum_level,
            (quantity <= minimum_level) AS low_stock
     FROM relief_items ORDER BY category ASC, item_name ASC"
)->fetchAll(PDO::FETCH_ASSOC);

$low_stock_report = array_values(array_filter($current_inventory, fn($i) => $i['low_stock']));

$stock_in_stmt = $conn->prepare(
    "SELECT ri.item_name, ri.unit, SUM(il.quantity_change) AS total_in, COUNT(*) AS transaction_count
     FROM inventory_logs il JOIN relief_items ri ON il.item_id = ri.item_id
     $date_where AND il.log_type = 'Stock In'
     GROUP BY il.item_id ORDER BY total_in DESC"
);
$stock_in_stmt->execute($params);
$stock_in_report = $stock_in_stmt->fetchAll(PDO::FETCH_ASSOC);
$total_stock_in = array_sum(array_column($stock_in_report, 'total_in'));

$stock_out_stmt = $conn->prepare(
    "SELECT ri.item_name, ri.unit, SUM(ABS(il.quantity_change)) AS total_out, COUNT(*) AS transaction_count
     FROM inventory_logs il JOIN relief_items ri ON il.item_id = ri.item_id
     $date_where AND il.log_type = 'Stock Out'
     GROUP BY il.item_id ORDER BY total_out DESC"
);
$stock_out_stmt->execute($params);
$stock_out_report = $stock_out_stmt->fetchAll(PDO::FETCH_ASSOC);
$total_stock_out = array_sum(array_column($stock_out_report, 'total_out'));

$donation_where = str_replace('il.created_at', 'd.donation_date', $date_where);
$donation_stmt = $conn->prepare(
    "SELECT ri.item_name, ri.unit, SUM(d.quantity) AS total_donated, COUNT(*) AS donation_count,
            GROUP_CONCAT(DISTINCT d.donor_name SEPARATOR ', ') AS donors
     FROM donations d JOIN relief_items ri ON d.item_id = ri.item_id
     $donation_where
     GROUP BY d.item_id ORDER BY total_donated DESC"
);
$donation_stmt->execute($params);
$donation_report = $donation_stmt->fetchAll(PDO::FETCH_ASSOC);
$total_donated = array_sum(array_column($donation_report, 'total_donated'));

echo json_encode([
    "success" => true,
    "data" => [
        "current_inventory" => $current_inventory,
        "low_stock_report" => $low_stock_report,
        "stock_in_report" => $stock_in_report,
        "total_stock_in" => intval($total_stock_in),
        "stock_out_report" => $stock_out_report,
        "total_stock_out" => intval($total_stock_out),
        "donation_report" => $donation_report,
        "total_donated" => intval($total_donated),
    ]
]);

<?php
require_once __DIR__ . '/../../config/cors.php';
require_once __DIR__ . '/../../config/database.php';

require_login(['admin', 'relief_personnel']); // Phase 21: staff only (residents no longer use this data)

$database = new Database();
$conn = $database->connect();

$packages = $conn->query("SELECT * FROM relief_packages ORDER BY package_name ASC")->fetchAll(PDO::FETCH_ASSOC);

$item_stmt = $conn->prepare(
    "SELECT rpi.item_id, rpi.quantity, ri.item_name, ri.unit, ri.category, ri.quantity AS available_stock
     FROM relief_package_items rpi
     JOIN relief_items ri ON rpi.item_id = ri.item_id
     WHERE rpi.package_id = :package_id"
);

foreach ($packages as &$package) {
    $item_stmt->execute([':package_id' => $package['package_id']]);
    $package['items'] = $item_stmt->fetchAll(PDO::FETCH_ASSOC);
}

echo json_encode(["success" => true, "data" => $packages]);

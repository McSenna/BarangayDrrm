<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';

require_login(['admin']);

$data = json_decode(file_get_contents("php://input"), true);

$item_name = trim($data['item_name'] ?? '');
$category = $data['category'] ?? '';
$quantity = intval($data['quantity'] ?? 0);
$unit = trim($data['unit'] ?? 'pcs');
$minimum_level = intval($data['minimum_level'] ?? 10);
$expiration_date = !empty($data['expiration_date']) ? $data['expiration_date'] : null;

if ($item_name === '' || $category === '') {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "Please enter the item name and select a category."]);
    exit();
}

$database = new Database();
$conn = $database->connect();

// Category must match an active category managed under System Settings > Inventory Settings (Phase 14)
$catCheck = $conn->prepare("SELECT category_id FROM inventory_categories WHERE category_name = :category AND is_active = 1");
$catCheck->execute([':category' => $category]);
if (!$catCheck->fetch()) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "Please select an active category."]);
    exit();
}

$stmt = $conn->prepare(
    "INSERT INTO relief_items (item_name, category, quantity, unit, minimum_level, expiration_date)
     VALUES (:item_name, :category, :quantity, :unit, :minimum_level, :expiration_date)"
);

$stmt->execute([
    ':item_name' => $item_name,
    ':category' => $category,
    ':quantity' => $quantity,
    ':unit' => $unit,
    ':minimum_level' => $minimum_level,
    ':expiration_date' => $expiration_date,
]);

$item_id = $conn->lastInsertId();

if ($quantity > 0) {
    $log = $conn->prepare(
        "INSERT INTO inventory_logs (item_id, log_type, quantity_change, resulting_quantity, reference, performed_by)
         VALUES (:item_id, 'Stock In', :qty, :qty, 'Initial stock on item creation', :performed_by)"
    );
    $log->execute([':item_id' => $item_id, ':qty' => $quantity, ':performed_by' => $_SESSION['user_id']]);
}

log_action($conn, "Relief item added", $item_name);

http_response_code(201);
echo json_encode(["success" => true, "message" => "Item added.", "item_id" => $item_id]);

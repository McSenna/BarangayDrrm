<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';

require_login(['admin']);

$data = json_decode(file_get_contents("php://input"), true);
$item_id = intval($data['item_id'] ?? 0);

if ($item_id <= 0) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "The relief item could not be found. Please refresh the page and try again."]);
    exit();
}

$category = $data['category'] ?? '';
if ($category === '') {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "A valid category is required."]);
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
    "UPDATE relief_items SET
        item_name = :item_name,
        category = :category,
        unit = :unit,
        minimum_level = :minimum_level,
        expiration_date = :expiration_date
     WHERE item_id = :item_id"
);

$stmt->execute([
    ':item_name' => trim($data['item_name'] ?? ''),
    ':category' => $category,
    ':unit' => trim($data['unit'] ?? 'pcs'),
    ':minimum_level' => intval($data['minimum_level'] ?? 10),
    ':expiration_date' => !empty($data['expiration_date']) ? $data['expiration_date'] : null,
    ':item_id' => $item_id,
]);

log_action($conn, "Relief item updated", "item_id: $item_id");

echo json_encode(["success" => true, "message" => "Item updated."]);

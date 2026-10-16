<?php
require_once __DIR__ . '/../../config/cors.php';
require_once __DIR__ . '/../../config/database.php';

require_login(['admin']);

$data = json_decode(file_get_contents("php://input"), true);
$category_id = intval($data['category_id'] ?? 0);
$category_name = trim($data['category_name'] ?? '');
$is_active = isset($data['is_active']) ? intval($data['is_active']) : 1;

if ($category_id <= 0 || $category_name === '') {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "Please enter a category name."]);
    exit();
}

$database = new Database();
$conn = $database->connect();

$existing = $conn->prepare("SELECT category_name FROM inventory_categories WHERE category_id = :id");
$existing->execute([':id' => $category_id]);
$old = $existing->fetch(PDO::FETCH_ASSOC);

if (!$old) {
    http_response_code(404);
    echo json_encode(["success" => false, "message" => "Category not found."]);
    exit();
}

// Guard against renaming to a name already used by ANOTHER category
$check = $conn->prepare("SELECT category_id FROM inventory_categories WHERE category_name = :name AND category_id != :id");
$check->execute([':name' => $category_name, ':id' => $category_id]);
if ($check->fetch()) {
    http_response_code(409);
    echo json_encode(["success" => false, "message" => "Another category already uses this name."]);
    exit();
}

$conn->beginTransaction();

$stmt = $conn->prepare("UPDATE inventory_categories SET category_name = :name, is_active = :is_active WHERE category_id = :id");
$stmt->execute([':name' => $category_name, ':is_active' => $is_active, ':id' => $category_id]);

// If the name changed, cascade the rename into any relief_items already using the old name
if ($old['category_name'] !== $category_name) {
    $cascade = $conn->prepare("UPDATE relief_items SET category = :new_name WHERE category = :old_name");
    $cascade->execute([':new_name' => $category_name, ':old_name' => $old['category_name']]);
}

$conn->commit();

log_action($conn, "Inventory category updated", "category_id: $category_id -> $category_name");

echo json_encode(["success" => true, "message" => "Category updated."]);

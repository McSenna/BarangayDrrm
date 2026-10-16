<?php
require_once __DIR__ . '/../../config/cors.php';
require_once __DIR__ . '/../../config/database.php';

require_login(['admin']);

$data = json_decode(file_get_contents("php://input"), true);
$category_id = intval($data['category_id'] ?? 0);

if ($category_id <= 0) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "We couldn't identify this category. Please refresh the page and try again."]);
    exit();
}

$database = new Database();
$conn = $database->connect();

$find = $conn->prepare("SELECT category_name FROM inventory_categories WHERE category_id = :id");
$find->execute([':id' => $category_id]);
$cat = $find->fetch(PDO::FETCH_ASSOC);

if (!$cat) {
    http_response_code(404);
    echo json_encode(["success" => false, "message" => "Category not found."]);
    exit();
}

// Block hard delete if any relief item still uses this category — deactivating
// it instead keeps existing items valid and simply hides it from the dropdown.
$inUse = $conn->prepare("SELECT COUNT(*) FROM relief_items WHERE category = :name");
$inUse->execute([':name' => $cat['category_name']]);
if (intval($inUse->fetchColumn()) > 0) {
    http_response_code(409);
    echo json_encode(["success" => false, "message" => "This category cannot be deleted because relief items use it. You can deactivate it instead."]);
    exit();
}

$stmt = $conn->prepare("DELETE FROM inventory_categories WHERE category_id = :id");
$stmt->execute([':id' => $category_id]);

log_action($conn, "Inventory category deleted", $cat['category_name']);

echo json_encode(["success" => true, "message" => "Category deleted."]);

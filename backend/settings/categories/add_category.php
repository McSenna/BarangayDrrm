<?php
require_once __DIR__ . '/../../config/cors.php';
require_once __DIR__ . '/../../config/database.php';

require_login(['admin']);

$data = json_decode(file_get_contents("php://input"), true);
$category_name = trim($data['category_name'] ?? '');

if ($category_name === '') {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "Please enter a category name."]);
    exit();
}

$database = new Database();
$conn = $database->connect();

$check = $conn->prepare("SELECT category_id FROM inventory_categories WHERE category_name = :name");
$check->execute([':name' => $category_name]);
if ($check->fetch()) {
    http_response_code(409);
    echo json_encode(["success" => false, "message" => "This category already exists."]);
    exit();
}

$stmt = $conn->prepare("INSERT INTO inventory_categories (category_name, is_active) VALUES (:name, 1)");
$stmt->execute([':name' => $category_name]);

// Phase 17 fix: capture the new category's ID before log_action() inserts
// into audit_logs (see disasters/create_report.php for the same bug pattern).
$category_id = $conn->lastInsertId();

log_action($conn, "Inventory category added", $category_name);

http_response_code(201);
echo json_encode(["success" => true, "message" => "Category added.", "category_id" => $category_id]);

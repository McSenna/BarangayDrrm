<?php
require_once __DIR__ . '/../../config/cors.php';
require_once __DIR__ . '/../../config/database.php';

require_login(['admin']);

$data = json_decode(file_get_contents("php://input"), true);
$package_id = intval($data['package_id'] ?? 0);
$package_name = trim($data['package_name'] ?? '');
$description = trim($data['description'] ?? '');
$is_active = isset($data['is_active']) ? intval((bool)$data['is_active']) : 1;
$items = $data['items'] ?? [];

if ($package_id <= 0 || $package_name === '') {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "Package name is required."]);
    exit();
}

if (!is_array($items) || count($items) === 0) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "A package needs at least one item."]);
    exit();
}

$database = new Database();
$conn = $database->connect();

try {
    $conn->beginTransaction();

    $stmt = $conn->prepare(
        "UPDATE relief_packages SET package_name = :package_name, description = :description, is_active = :is_active WHERE package_id = :package_id"
    );
    $stmt->execute([
        ':package_name' => $package_name,
        ':description' => $description,
        ':is_active' => $is_active,
        ':package_id' => $package_id,
    ]);

    // Replace items wholesale — simpler and safer than diffing add/remove for a capstone-scale tool.
    $conn->prepare("DELETE FROM relief_package_items WHERE package_id = :package_id")->execute([':package_id' => $package_id]);

    $item_stmt = $conn->prepare(
        "INSERT INTO relief_package_items (package_id, item_id, quantity) VALUES (:package_id, :item_id, :quantity)"
    );
    foreach ($items as $item) {
        $item_id = intval($item['item_id'] ?? 0);
        $quantity = intval($item['quantity'] ?? 0);
        if ($item_id <= 0 || $quantity <= 0) continue;
        $item_stmt->execute([':package_id' => $package_id, ':item_id' => $item_id, ':quantity' => $quantity]);
    }

    $conn->commit();

    log_action($conn, "Relief package updated", "package_id: $package_id");

    echo json_encode(["success" => true, "message" => "Package updated."]);
} catch (Exception $e) {
    $conn->rollBack();
    http_response_code(500);
    error_log("relief/packages/update_package.php: " . $e->getMessage());
    echo json_encode(["success" => false, "message" => "We couldn't update the relief package. Please make sure each relief item is listed only once, then try again."]);
}

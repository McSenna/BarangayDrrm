<?php
require_once __DIR__ . '/../../config/cors.php';
require_once __DIR__ . '/../../config/database.php';

require_login(['admin']);

$data = json_decode(file_get_contents("php://input"), true);
$package_name = trim($data['package_name'] ?? '');
$description = trim($data['description'] ?? '');
$items = $data['items'] ?? [];

if ($package_name === '') {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "Package name is required."]);
    exit();
}

if (!is_array($items) || count($items) === 0) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "Please add at least one relief item to the package."]);
    exit();
}

$database = new Database();
$conn = $database->connect();

try {
    $conn->beginTransaction();

    $stmt = $conn->prepare(
        "INSERT INTO relief_packages (package_name, description, created_by) VALUES (:package_name, :description, :created_by)"
    );
    $stmt->execute([
        ':package_name' => $package_name,
        ':description' => $description,
        ':created_by' => $_SESSION['user_id'],
    ]);
    $package_id = $conn->lastInsertId();

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

    log_action($conn, "Relief package created", $package_name);

    http_response_code(201);
    echo json_encode(["success" => true, "message" => "Package created.", "package_id" => $package_id]);
} catch (Exception $e) {
    $conn->rollBack();
    http_response_code(500);
    error_log("relief/packages/add_package.php: " . $e->getMessage());
    echo json_encode(["success" => false, "message" => "We couldn't create the relief package. Please make sure each relief item is listed only once, then try again."]);
}

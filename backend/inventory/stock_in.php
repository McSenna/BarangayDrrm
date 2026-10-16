<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';

require_login(['admin']);

$data = json_decode(file_get_contents("php://input"), true);
$item_id = intval($data['item_id'] ?? 0);
$quantity = intval($data['quantity'] ?? 0);
$reference = trim($data['reference'] ?? '');

if ($item_id <= 0 || $quantity <= 0) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "Please enter a quantity greater than 0."]);
    exit();
}

$database = new Database();
$conn = $database->connect();

try {
    $conn->beginTransaction();

    $stmt = $conn->prepare("UPDATE relief_items SET quantity = quantity + :quantity WHERE item_id = :item_id");
    $stmt->execute([':quantity' => $quantity, ':item_id' => $item_id]);

    $result_stmt = $conn->prepare("SELECT quantity FROM relief_items WHERE item_id = :item_id");
    $result_stmt->execute([':item_id' => $item_id]);
    $resulting_quantity = $result_stmt->fetchColumn();

    if ($resulting_quantity === false) {
        $conn->rollBack();
        http_response_code(404);
        echo json_encode(["success" => false, "message" => "Item not found."]);
        exit();
    }

    $log = $conn->prepare(
        "INSERT INTO inventory_logs (item_id, log_type, quantity_change, resulting_quantity, reference, performed_by)
         VALUES (:item_id, 'Stock In', :qty, :resulting_quantity, :reference, :performed_by)"
    );
    $log->execute([
        ':item_id' => $item_id,
        ':qty' => $quantity,
        ':resulting_quantity' => $resulting_quantity,
        ':reference' => $reference !== '' ? $reference : null,
        ':performed_by' => $_SESSION['user_id'],
    ]);

    $conn->commit();

    log_action($conn, "Stock in", "item_id: $item_id, +$quantity");

    echo json_encode(["success" => true, "message" => "Stock added.", "resulting_quantity" => intval($resulting_quantity)]);
} catch (Exception $e) {
    $conn->rollBack();
    http_response_code(500);
    error_log("inventory/stock_in.php: " . $e->getMessage());
    echo json_encode(["success" => false, "message" => "We couldn't record the Stock In. Please try again."]);
}

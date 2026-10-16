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

    $check = $conn->prepare("SELECT quantity, unit FROM relief_items WHERE item_id = :item_id FOR UPDATE");
    $check->execute([':item_id' => $item_id]);
    $item = $check->fetch(PDO::FETCH_ASSOC);

    if (!$item) {
        $conn->rollBack();
        http_response_code(404);
        echo json_encode(["success" => false, "message" => "Item not found."]);
        exit();
    }

    if ($item['quantity'] < $quantity) {
        $conn->rollBack();
        http_response_code(400);
        echo json_encode(["success" => false, "message" => "Not enough stock available. The quantity to remove is more than the current stock."]);
        exit();
    }

    // Stock already committed to Approved (not yet distributed) allocations must
    // stay on hand; it is physically deducted only when marked Distributed.
    $committed_stmt = $conn->prepare(
        "SELECT COALESCE(SUM(quantity), 0) FROM relief_allocations WHERE item_id = :item_id AND status = 'Approved' LOCK IN SHARE MODE"
    );
    $committed_stmt->execute([':item_id' => $item_id]);
    $committed = intval($committed_stmt->fetchColumn());
    $available = max(0, intval($item['quantity']) - $committed);
    if ($quantity > $available) {
        $conn->rollBack();
        http_response_code(409);
        $unit = $item['unit'];
        echo json_encode([
            "success" => false,
            "message" => "Only $available $unit can be removed. Of the {$item['quantity']} $unit in stock, $committed $unit "
                       . "are reserved for approved relief allocations that have not been distributed yet.",
            "available" => $available,
        ]);
        exit();
    }

    $stmt = $conn->prepare("UPDATE relief_items SET quantity = quantity - :quantity WHERE item_id = :item_id");
    $stmt->execute([':quantity' => $quantity, ':item_id' => $item_id]);

    $resulting_quantity = intval($item['quantity']) - $quantity;

    $log = $conn->prepare(
        "INSERT INTO inventory_logs (item_id, log_type, quantity_change, resulting_quantity, reference, performed_by)
         VALUES (:item_id, 'Stock Out', :qty, :resulting_quantity, :reference, :performed_by)"
    );
    $log->execute([
        ':item_id' => $item_id,
        ':qty' => -$quantity,
        ':resulting_quantity' => $resulting_quantity,
        ':reference' => $reference !== '' ? $reference : null,
        ':performed_by' => $_SESSION['user_id'],
    ]);

    $conn->commit();

    log_action($conn, "Stock out", "item_id: $item_id, -$quantity");

    echo json_encode(["success" => true, "message" => "Stock removed.", "resulting_quantity" => $resulting_quantity]);
} catch (Exception $e) {
    $conn->rollBack();
    http_response_code(500);
    error_log("inventory/stock_out.php: " . $e->getMessage());
    echo json_encode(["success" => false, "message" => "We couldn't record the Stock Out. Please try again."]);
}

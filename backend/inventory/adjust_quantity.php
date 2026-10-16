<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';

require_login(['admin']);

$data = json_decode(file_get_contents("php://input"), true);
$item_id = intval($data['item_id'] ?? 0);
$new_quantity = isset($data['new_quantity']) ? intval($data['new_quantity']) : null;
$reason = trim($data['reason'] ?? '');

if ($item_id <= 0 || $new_quantity === null || $new_quantity < 0) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "Please enter a valid quantity (0 or more)."]);
    exit();
}

if ($reason === '') {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "Please enter a reason for the adjustment (for example, physical count correction)."]);
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


    // Stock already committed to Approved (not yet distributed) allocations must
    // stay on hand; it is physically deducted only when marked Distributed.
    $committed_stmt = $conn->prepare(
        "SELECT COALESCE(SUM(quantity), 0) FROM relief_allocations WHERE item_id = :item_id AND status = 'Approved' LOCK IN SHARE MODE"
    );
    $committed_stmt->execute([':item_id' => $item_id]);
    $committed = intval($committed_stmt->fetchColumn());
    // A correction may not leave less stock than is reserved for approved
    // allocations (raising the quantity is always allowed).
    if ($new_quantity < intval($item['quantity']) && $new_quantity < $committed) {
        $conn->rollBack();
        http_response_code(409);
        $unit = $item['unit'];
        echo json_encode([
            "success" => false,
            "message" => "The quantity cannot be set below $committed $unit, the amount reserved for approved relief "
                       . "allocations that have not been distributed yet.",
            "committed" => $committed,
        ]);
        exit();
    }

    $delta = $new_quantity - intval($item['quantity']);

    $stmt = $conn->prepare("UPDATE relief_items SET quantity = :new_quantity WHERE item_id = :item_id");
    $stmt->execute([':new_quantity' => $new_quantity, ':item_id' => $item_id]);

    $log = $conn->prepare(
        "INSERT INTO inventory_logs (item_id, log_type, quantity_change, resulting_quantity, reference, performed_by)
         VALUES (:item_id, 'Adjustment', :delta, :resulting_quantity, :reason, :performed_by)"
    );
    $log->execute([
        ':item_id' => $item_id,
        ':delta' => $delta,
        ':resulting_quantity' => $new_quantity,
        ':reason' => $reason,
        ':performed_by' => $_SESSION['user_id'],
    ]);

    $conn->commit();

    log_action($conn, "Inventory quantity adjusted", "item_id: $item_id, delta: $delta, reason: $reason");

    echo json_encode(["success" => true, "message" => "Quantity adjusted.", "resulting_quantity" => $new_quantity]);
} catch (Exception $e) {
    $conn->rollBack();
    http_response_code(500);
    error_log("inventory/adjust_quantity.php: " . $e->getMessage());
    echo json_encode(["success" => false, "message" => "We couldn't save the quantity adjustment. Please try again."]);
}

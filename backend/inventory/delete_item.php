<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';

require_login(['admin']);

$data = json_decode(file_get_contents("php://input"), true);
$item_id = intval($data['item_id'] ?? $_GET['item_id'] ?? 0);

if ($item_id <= 0) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "The relief item could not be found. Please refresh the page and try again."]);
    exit();
}

$database = new Database();
$conn = $database->connect();

// Phase 16 — relief_allocations.item_id, inventory_logs.item_id,
// donations.item_id, and relief_package_items.item_id were changed from
// ON DELETE CASCADE to ON DELETE RESTRICT (see
// database/migration_phase16_database_improvements.sql), so a relief item
// with any transaction, distribution, or package history can no longer be
// deleted — deleting it used to silently erase that history along with it.
// This upfront check gives a clear message instead of letting the request
// fail on the database constraint; the try/catch below is a backstop in
// case any other reference is ever added later.
// Relief allocation workflow: an item planned for a Ready household, or in the standard relief package, stays.
$planned = $conn->prepare(
    "SELECT COUNT(*) FROM household_allocation_items ai JOIN household_allocations a ON a.allocation_id = ai.allocation_id
     WHERE ai.item_id = :item_id AND a.status = 'READY_FOR_DISTRIBUTION'"
);
$planned->execute([':item_id' => $item_id]);
$readyCount = intval($planned->fetchColumn());
$standard = $conn->prepare(
    "SELECT COUNT(*) FROM relief_package_items pi JOIN system_settings s ON s.setting_key = 'standard_relief_package_id' AND s.setting_value = CAST(pi.package_id AS CHAR)
     WHERE pi.item_id = :item_id"
);
$standard->execute([':item_id' => $item_id]);
if ($readyCount > 0 || intval($standard->fetchColumn()) > 0) {
    http_response_code(409);
    echo json_encode(["success" => false, "message" => "Used by $readyCount ready allocation(s) or the standard package. Complete or re-open those allocations, or change the standard package, first."]);
    exit();
}

$inUse = $conn->prepare(
    "SELECT
        (SELECT COUNT(*) FROM relief_allocations WHERE item_id = :item_id1) +
        (SELECT COUNT(*) FROM household_allocation_items WHERE item_id = :item_id5) +
        (SELECT COUNT(*) FROM inventory_logs WHERE item_id = :item_id2) +
        (SELECT COUNT(*) FROM donations WHERE item_id = :item_id3) +
        (SELECT COUNT(*) FROM relief_package_items WHERE item_id = :item_id4)
     AS usage_count"
);
$inUse->execute([
    ':item_id1' => $item_id, ':item_id2' => $item_id,
    ':item_id3' => $item_id, ':item_id4' => $item_id, ':item_id5' => $item_id,
]);
if (intval($inUse->fetchColumn()) > 0) {
    http_response_code(409);
    echo json_encode([
        "success" => false,
        "message" => "This relief item cannot be deleted because it has stock or distribution records. You can set its quantity to 0 instead.",
    ]);
    exit();
}

try {
    $stmt = $conn->prepare("DELETE FROM relief_items WHERE item_id = :item_id");
    $stmt->execute([':item_id' => $item_id]);
} catch (PDOException $e) {
    // Backstop: if some other reference blocks the delete at the database
    // level, report it cleanly instead of exposing the raw SQL/PDO error.
    if ($e->getCode() === '23000') {
        http_response_code(409);
        echo json_encode([
            "success" => false,
            "message" => "This relief item cannot be deleted because it has transaction or distribution history.",
        ]);
        exit();
    }
    http_response_code(500);
    echo json_encode(["success" => false, "message" => "Could not delete this item."]);
    exit();
}

log_action($conn, "Relief item deleted", "item_id: $item_id");

echo json_encode(["success" => true, "message" => "Item deleted."]);

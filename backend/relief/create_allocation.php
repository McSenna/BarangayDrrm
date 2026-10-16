<?php
/**
 * Add Allocation (manual) — creates a PENDING relief allocation for the
 * Administrator to approve.
 *
 * Phase 25 (audit F-ALLOC-01): the manual path now follows the same rules as
 * every other path:
 *   - strict input (whole numbers, a real household and item, a valid date)
 *   - inside one transaction the item row is locked (SELECT ... FOR UPDATE);
 *     a household may not hold two active (Pending/Approved) allocations of
 *     the same item -> 409; concurrent requests queue behind the lock
 *   - the quantity must fit within AVAILABLE stock (stock - approved, not yet
 *     distributed) -> 409; a Pending allocation reserves nothing yet, and
 *     approve_allocation.php re-checks everything under lock
 *   - optional disaster event; optional reason (stored as the allocation's reason)
 */
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../lib/allocation_service.php';

require_login(['admin']);

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(["success" => false, "message" => "Method not allowed."]);
    exit();
}

$data = json_decode(file_get_contents("php://input"), true);
if (!is_array($data)) $data = [];
$bad = function ($msg, $code = 400, $extra = []) {
    http_response_code($code);
    echo json_encode(array_merge(["success" => false, "message" => $msg], $extra));
    exit();
};

$household_id = allocation_input_int($data['household_id'] ?? null);
$item_id = allocation_input_int($data['item_id'] ?? null);
$quantity = allocation_input_int($data['quantity'] ?? null);
$event_id = isset($data['event_id']) && $data['event_id'] !== '' && $data['event_id'] !== null ? allocation_input_int($data['event_id']) : 0;
$reason = is_string($data['reason'] ?? null) ? mb_substr(trim($data['reason']), 0, 500) : '';
$allocation_date = is_string($data['allocation_date'] ?? null) && $data['allocation_date'] !== '' ? $data['allocation_date'] : date('Y-m-d');

if ($household_id <= 0 || $item_id <= 0 || $quantity <= 0) {
    $bad("Please select a household and a relief item, and enter a whole-number quantity of at least 1.");
}
$d = DateTime::createFromFormat('Y-m-d', $allocation_date);
if (!$d || $d->format('Y-m-d') !== $allocation_date) $bad("Please enter a valid allocation date.");

$conn = (new Database())->connect();

$hh = $conn->prepare("SELECT household_id, head_of_family FROM households WHERE household_id = :id");
$hh->execute([':id' => $household_id]);
$household = $hh->fetch(PDO::FETCH_ASSOC);
if (!$household) $bad("Household not found.", 404);
if ($event_id) {
    $ev = $conn->prepare("SELECT event_id FROM disaster_events WHERE event_id = :id");
    $ev->execute([':id' => $event_id]);
    if (!$ev->fetch()) $bad("The selected disaster event could not be found.", 404);
}

try {
    $conn->beginTransaction();
    $it = $conn->prepare("SELECT item_id, item_name, unit, quantity FROM relief_items WHERE item_id = :id FOR UPDATE");
    $it->execute([':id' => $item_id]);
    $item = $it->fetch(PDO::FETCH_ASSOC);
    if (!$item) { $conn->rollBack(); $bad("Relief item not found.", 404); }

    $dup = allocation_active_duplicate($conn, $household_id, $item_id);
    if ($dup) {
        $conn->rollBack();
        $bad("{$household['head_of_family']} already has a {$dup['status']} allocation of {$item['item_name']} (#{$dup['allocation_id']}). "
           . "Change or cancel that allocation instead of adding a second one.", 409, ["existing_allocation_id" => intval($dup['allocation_id'])]);
    }
    $av = allocation_available_locked($conn, $item_id, intval($item['quantity']));
    if ($quantity > $av['available']) {
        $conn->rollBack();
        $bad("Not enough stock: only {$av['available']} {$item['unit']} of {$item['item_name']} is available "
           . "({$item['quantity']} in stock, {$av['committed']} already reserved for approved allocations).", 409, ["available" => $av['available']]);
    }

    $ins = $conn->prepare(
        "INSERT INTO relief_allocations (household_id, item_id, quantity, status, allocation_date, recommendation_reason)
         VALUES (:h, :i, :q, 'Pending', :d, :r)"
    );
    $ins->execute([':h' => $household_id, ':i' => $item_id, ':q' => $quantity, ':d' => $allocation_date,
                   ':r' => "Manual allocation by the Administrator" . ($reason !== '' ? ": $reason" : " (no reason given).")]);
    $allocation_id = intval($conn->lastInsertId());
    if ($event_id && allocation_phase25_ready($conn)) {
        $conn->prepare("UPDATE relief_allocations SET event_id = :e WHERE allocation_id = :id")->execute([':e' => $event_id, ':id' => $allocation_id]);
    }
    log_action($conn, "Relief allocation created", "allocation_id: $allocation_id, household_id: $household_id, item_id: $item_id, qty: $quantity (Pending)");
    $conn->commit();
} catch (Throwable $e) {
    if ($conn->inTransaction()) $conn->rollBack();
    error_log("relief/create_allocation.php: " . $e->getMessage());
    $bad("We couldn't create the allocation. Please try again.", 500);
}

http_response_code(201);
echo json_encode(["success" => true, "message" => "Relief Allocation created with Pending status. It reserves stock only when approved.", "allocation_id" => $allocation_id]);

<?php
/**
 * Distribute an APPROVED relief allocation (Approved -> Distributed).
 * Phase 17 Fix 4: distribution can no longer bypass approval.
 *
 * Workflow enforced here (not only in the UI):
 *     Pending -> Approved (approve_allocation.php / approve_recommendation.php)
 *             -> Distributed (this file)
 *
 * Stock rule: an Approved allocation's quantity is already counted in the
 * "committed" stock used by Fixes 1-3, so at distribution time the only
 * check needed is that the PHYSICAL stock, re-read under a row lock, still
 * covers the quantity. Deducting it reduces current stock and committed stock
 * by the same amount, so "available" for everyone else is unchanged.
 *
 * Everything runs in one transaction (allocation row locked first, then the
 * item row — same order as approve_allocation.php):
 *   deduct stock once -> mark Distributed -> inventory_logs 'Stock Out' row
 *   -> audit log -> COMMIT.  Any failure rolls back and writes nothing.
 *
 * Phase 25 (partial receipt, audit F-ALLOC-03): optional received_quantity
 * (1..allocated) and remarks. Only the quantity actually handed over is
 * deducted and logged as Stock Out; the rest of the reservation is released
 * (the allocation is no longer Approved). A partial receipt needs remarks.
 * Without received_quantity the full allocated quantity is recorded (unchanged).
 */
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../lib/requests.php';
require_once __DIR__ . '/../lib/notify.php';
require_once __DIR__ . '/../lib/allocation_service.php';

require_login(['admin', 'relief_personnel']);

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(["success" => false, "message" => "Method not allowed."]);
    exit();
}

$data = json_decode(file_get_contents("php://input"), true);
if (!is_array($data)) $data = [];

// Strict whole-number ID (intval() would have turned "5abc" into 5).
$raw_id = $data['allocation_id'] ?? null;
if (is_int($raw_id)) {
    $allocation_id = $raw_id;
} elseif (is_string($raw_id) && preg_match('/^\s*\d+\s*$/', $raw_id)) {
    $allocation_id = intval($raw_id);
} else {
    $allocation_id = 0;
}

if ($allocation_id <= 0) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "The allocation could not be found. Please refresh the page and try again."]);
    exit();
}

// Phase 25: actual quantity received (optional) and remarks.
$received_raw = $data['received_quantity'] ?? null;
$received_given = !($received_raw === null || $received_raw === '');
$received = $received_given ? allocation_input_int($received_raw) : 0;
$remarks = is_string($data['remarks'] ?? null) ? mb_substr(trim(preg_replace('/\s+/', ' ', $data['remarks'])), 0, 300) : '';
if ($received_given && $received <= 0) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "Received quantity must be a whole number of at least 1. If nothing was handed over, cancel the allocation instead."]);
    exit();
}

$database = new Database();
$conn = $database->connect();

/** Roll back, send an error response, and stop. */
function fail($conn, $code, $message)
{
    if ($conn->inTransaction()) $conn->rollBack();
    http_response_code($code);
    echo json_encode(["success" => false, "message" => $message]);
    exit();
}

try {
    $conn->beginTransaction();

    // Lock and fetch the allocation (plus its schedule's assigned personnel, if any).
    $stmt = $conn->prepare(
        "SELECT ra.*, h.head_of_family, ds.assigned_personnel AS schedule_personnel
         FROM relief_allocations ra
         JOIN households h ON ra.household_id = h.household_id
         LEFT JOIN distribution_schedules ds ON ra.schedule_id = ds.schedule_id
         WHERE ra.allocation_id = :allocation_id
         FOR UPDATE"
    );
    $stmt->execute([':allocation_id' => $allocation_id]);
    $allocation = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$allocation) {
        fail($conn, 404, "Allocation not found.");
    }

    // Relief personnel may not act on an allocation tied to another person's schedule
    // (same rule the schedule endpoints use). Allocations without a schedule have no
    // assignment field, so existing behaviour (any relief personnel) is preserved there.
    if ($_SESSION['role'] === 'relief_personnel'
        && $allocation['schedule_personnel'] !== null
        && intval($allocation['schedule_personnel']) !== intval($_SESSION['user_id'])) {
        fail($conn, 403, "You are not assigned to this allocation's distribution schedule.");
    }

    if ($allocation['status'] === 'Distributed') {
        fail($conn, 409, "This allocation was already distributed.");
    }
    if ($allocation['status'] !== 'Approved') {
        fail($conn, 409, "Only approved allocations can be distributed. This allocation is still {$allocation['status']}.");
    }

    $allocated = intval($allocation['quantity']);
    if ($allocated <= 0) {
        fail($conn, 400, "This allocation has an invalid quantity and cannot be distributed.");
    }
    // The quantity actually handed over (Phase 25); defaults to the full allocation.
    $quantity = $received_given ? $received : $allocated;
    if ($quantity > $allocated) {
        fail($conn, 400, "Received quantity ($quantity) cannot be more than the allocated $allocated.");
    }
    if ($quantity < $allocated && $remarks === '') {
        fail($conn, 400, "Please add a remark explaining why only $quantity of $allocated was received.");
    }
    if ($quantity < $allocated && !allocation_phase25_ready($conn)) {
        fail($conn, 503, "Partial receipt needs the Phase 25 database update.");
    }

    // Lock the item row and re-read the current physical stock.
    $item_stmt = $conn->prepare("SELECT item_id, item_name, unit, quantity FROM relief_items WHERE item_id = :item_id FOR UPDATE");
    $item_stmt->execute([':item_id' => $allocation['item_id']]);
    $item = $item_stmt->fetch(PDO::FETCH_ASSOC);

    if (!$item) {
        fail($conn, 404, "Relief item for this allocation was not found.");
    }

    $current_stock = intval($item['quantity']);
    $unit = $item['unit'];
    if ($current_stock < $quantity) {
        fail($conn, 409,
            "Not enough stock left to distribute this allocation: needs $quantity $unit of {$item['item_name']}, "
            . "only $current_stock $unit in stock.");
    }

    // Deduct exactly once; the WHERE guard also makes negative stock impossible.
    $reduce = $conn->prepare(
        "UPDATE relief_items SET quantity = quantity - :qty WHERE item_id = :item_id AND quantity >= :qty_check"
    );
    $reduce->execute([':qty' => $quantity, ':item_id' => $item['item_id'], ':qty_check' => $quantity]);
    if ($reduce->rowCount() !== 1) {
        fail($conn, 409, "The stock level changed while saving. Please refresh the page and try again.");
    }
    $resulting_quantity = $current_stock - $quantity;

    $mark = $conn->prepare(
        "UPDATE relief_allocations
         SET status = 'Distributed', distributed_by = :user_id, distributed_at = NOW()
         WHERE allocation_id = :allocation_id AND status = 'Approved'"
    );
    $mark->execute([':user_id' => $_SESSION['user_id'], ':allocation_id' => $allocation_id]);
    if ($mark->rowCount() !== 1) {
        fail($conn, 409, "This allocation's status changed during distribution. Refresh and try again.");
    }
    if (allocation_phase25_ready($conn)) {
        $conn->prepare("UPDATE relief_allocations SET received_quantity = :r, distribution_remarks = :m WHERE allocation_id = :id")
             ->execute([':r' => $quantity, ':m' => $remarks !== '' ? $remarks : null, ':id' => $allocation_id]);
    }

    // Inventory history: same 'Stock Out' shape as inventory/stock_out.php.
    $reference = "Relief distribution — allocation #$allocation_id, household #{$allocation['household_id']} ({$allocation['head_of_family']})"
               . ($quantity < $allocated ? ", partial: $quantity of $allocated" : "");
    $log = $conn->prepare(
        "INSERT INTO inventory_logs (item_id, log_type, quantity_change, resulting_quantity, reference, performed_by)
         VALUES (:item_id, 'Stock Out', :qty, :resulting_quantity, :reference, :performed_by)"
    );
    $log->execute([
        ':item_id' => $item['item_id'],
        ':qty' => -$quantity,
        ':resulting_quantity' => $resulting_quantity,
        ':reference' => mb_substr($reference, 0, 255),
        ':performed_by' => $_SESSION['user_id'],
    ]);

    // Phase 19: an allocation created from a relief request moves that request
    // to Distributed once all of its allocations have been distributed.
    $distributed_request_id = null;
    if (!empty($allocation['request_item_id'])) {
        $distributed_request_id = sync_request_distributed_status($conn, intval($allocation['request_item_id']));
    }

    // Audit entry inside the same transaction, so a failed distribution never logs as a success.
    log_action(
        $conn,
        "Relief distributed",
        "allocation_id: $allocation_id, household_id: {$allocation['household_id']} ({$allocation['head_of_family']}), "
            . "item_id: {$item['item_id']} ({$item['item_name']}), qty: $quantity $unit"
            . ($quantity < $allocated ? " (partial receipt of $allocated allocated; " . ($allocated - $quantity) . " $unit released; remarks: $remarks)" : "") . ", "
            . "stock: $current_stock -> $resulting_quantity $unit"
    );

    $conn->commit();
} catch (Exception $e) {
    if ($conn->inTransaction()) $conn->rollBack();
    http_response_code(500);
    error_log("relief/distribute.php: " . $e->getMessage());
    echo json_encode(["success" => false, "message" => "We couldn't record this distribution. Please try again."]);
    exit();
}

// Phase 19/20 — after COMMIT: tell the household. dispatch_notification() never
// throws, so an SMS failure can never reverse the committed distribution.
//   * allocation from a relief request: ONE SMS when the whole request is
//     distributed (not one per item) — event "request:<id>:distributed"
//   * allocation outside a request (Phase 20): SMS for that allocation —
//     event "allocation:<id>:distributed"
// Both are logged with event type ALLOCATION_DISTRIBUTED.
$sms_summary = null;
if ($distributed_request_id) {
    $req = $conn->prepare("SELECT household_id, user_id FROM relief_requests WHERE request_id = :id");
    $req->execute([':id' => $distributed_request_id]);
    $r = $req->fetch(PDO::FETCH_ASSOC);
    $sms_summary = dispatch_notification($conn, [['household_id' => $r['household_id']]],
        "request:$distributed_request_id:distributed", "Relief delivered",
        "All relief for your request #$distributed_request_id has been distributed. For concerns, please contact the barangay office.",
        ['link' => '/resident/relief-status', 'sms' => sms_on_approval_and_distribution(), 'sms_category' => 'Delivery Completed', 'sent_by' => $_SESSION['user_id'],
         'event_type' => 'ALLOCATION_DISTRIBUTED', 'request_id' => $distributed_request_id]);
} elseif (empty($allocation['request_item_id'])) {
    $sms_summary = dispatch_notification($conn, [['household_id' => $allocation['household_id']]],
        "allocation:$allocation_id:distributed", "Relief distributed",
        "Your relief allocation ({$quantity} {$unit} of {$item['item_name']}) has been recorded as distributed. Please contact the barangay office if you have concerns.",
        ['link' => '/resident/relief-status', 'sms' => sms_on_approval_and_distribution(), 'sms_category' => 'Delivery Completed', 'sent_by' => $_SESSION['user_id'],
         'event_type' => 'ALLOCATION_DISTRIBUTED', 'allocation_id' => $allocation_id]);
}
$sms_note = $sms_summary ? describe_sms_result($sms_summary) : null;

echo json_encode([
    "success" => true,
    "message" => ($quantity < $allocated
        ? "Partial receipt recorded: $quantity of $allocated $unit handed over. Only $quantity was deducted (Stock Out); the other " . ($allocated - $quantity) . " $unit are available again."
        : "Relief marked as Distributed. The quantity was deducted from Relief Inventory and recorded as Stock Out.") . ($sms_note ? " $sms_note" : ""),
    "sms_status" => $sms_summary['sms']['status'] ?? null,
    "allocation_id" => $allocation_id,
    "distributed_quantity" => $quantity,
    "allocated_quantity" => $allocated,
    "resulting_stock" => $resulting_quantity,
]);

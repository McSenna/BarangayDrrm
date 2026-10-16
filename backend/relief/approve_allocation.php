<?php
/**
 * Approve an existing Pending relief allocation (Pending -> Approved).
 * Phase 17 Fix 3: same stock-safety rule as the recommendation engine (Fix 1)
 * and approve_recommendation.php (Fix 2):
 *
 *     available = MAX(0, current stock - SUM(Approved, not yet distributed))
 *
 * The allocation's own quantity must fit within `available`. The allocation
 * row and the item row are locked (SELECT ... FOR UPDATE, same order as
 * distribute.php: allocation first, then item) inside one transaction, so
 * concurrent approvals/distributions of the same item cannot over-commit it.
 * Any failed check rolls back and writes nothing.
 *
 * Approval does NOT deduct inventory; stock is only deducted when the
 * allocation is distributed (distribute.php), exactly as before.
 */
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../lib/notify.php';
require_once __DIR__ . '/../lib/allocation_service.php';

require_login(['admin']);

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

$database = new Database();
$conn = $database->connect();

/** Roll back, send an error response, and stop. */
function fail($conn, $code, $message, $extra = [])
{
    if ($conn->inTransaction()) $conn->rollBack();
    http_response_code($code);
    echo json_encode(array_merge(["success" => false, "message" => $message], $extra));
    exit();
}

// Phase 25 (F-DSS-04): the DSS decision as it stands before this approval.
$pre = $conn->prepare("SELECT household_id FROM relief_allocations WHERE allocation_id = :id");
$pre->execute([':id' => $allocation_id]);
$pre_household = $pre->fetchColumn();
$snapshot = $pre_household ? dss_snapshot_for_household($conn, intval($pre_household)) : null;

try {
    $conn->beginTransaction();

    // Lock the allocation first (same lock order as distribute.php).
    $stmt = $conn->prepare(
        "SELECT ra.*, h.head_of_family
         FROM relief_allocations ra
         JOIN households h ON ra.household_id = h.household_id
         WHERE ra.allocation_id = :allocation_id
         FOR UPDATE"
    );
    $stmt->execute([':allocation_id' => $allocation_id]);
    $allocation = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$allocation) {
        fail($conn, 404, "Allocation not found.");
    }
    if ($allocation['status'] === 'Approved') {
        fail($conn, 409, "This allocation is already approved.");
    }
    if ($allocation['status'] === 'Distributed') {
        fail($conn, 409, "This allocation has already been distributed.");
    }
    if ($allocation['status'] !== 'Pending') {
        fail($conn, 409, "Only Pending allocations can be approved.");
    }

    $quantity = intval($allocation['quantity']);
    if ($quantity <= 0) {
        fail($conn, 400, "This allocation has an invalid quantity and cannot be approved.");
    }

    // Then lock the item row and recompute availability from the database.
    $item_stmt = $conn->prepare("SELECT item_id, item_name, unit, quantity FROM relief_items WHERE item_id = :item_id FOR UPDATE");
    $item_stmt->execute([':item_id' => $allocation['item_id']]);
    $item = $item_stmt->fetch(PDO::FETCH_ASSOC);
    if (!$item) {
        fail($conn, 404, "Relief item for this allocation was not found.");
    }

    $committed_stmt = $conn->prepare(
        "SELECT COALESCE(SUM(quantity), 0) FROM relief_allocations WHERE item_id = :item_id AND status = 'Approved' LOCK IN SHARE MODE"
    );
    $committed_stmt->execute([':item_id' => $item['item_id']]);
    $committed = intval($committed_stmt->fetchColumn());
    $current_stock = intval($item['quantity']);
    $available = max(0, $current_stock - $committed);
    $unit = $item['unit'];

    if ($quantity > $available) {
        fail($conn, 409,
            "Not enough stock to approve: this allocation needs $quantity $unit of {$item['item_name']}, "
            . "but only $available $unit is available ($current_stock in stock, $committed already committed to approved allocations).",
            ["available" => $available]
        );
    }

    // Phase 25 (F-ALLOC-01): never approve a second active allocation of the same item.
    $dup = allocation_active_duplicate($conn, intval($allocation['household_id']), intval($item['item_id']), $allocation_id, ['Approved']);
    if ($dup) {
        fail($conn, 409, "{$allocation['head_of_family']} already has an Approved allocation of {$item['item_name']} (#{$dup['allocation_id']}). "
            . "This duplicate was not approved; cancel it or change the existing allocation.", ["existing_allocation_id" => intval($dup['allocation_id'])]);
    }

    $update = $conn->prepare(
        "UPDATE relief_allocations SET status = 'Approved', approved_by = :approved_by, approved_at = NOW()
         WHERE allocation_id = :allocation_id AND status = 'Pending'"
    );
    $update->execute([':approved_by' => $_SESSION['user_id'], ':allocation_id' => $allocation_id]);
    if ($update->rowCount() !== 1) {
        fail($conn, 409, "This allocation's status has changed. Please refresh the page and try again.");
    }
    if ($snapshot !== null && intval($pre_household) === intval($allocation['household_id'])) {
        allocation_store_decision($conn, $allocation_id, $snapshot);
    }

    // Audit entry is part of the same transaction (log_action uses this connection).
    log_action(
        $conn,
        "Relief allocation approved",
        "allocation_id: $allocation_id, household_id: {$allocation['household_id']} ({$allocation['head_of_family']}), "
            . "item_id: {$item['item_id']} ({$item['item_name']}), qty: $quantity $unit, "
            . "available before approval: $available $unit"
            . ($snapshot ? ", DSS at approval: " . ($snapshot['dss_score'] ?? 'n/a') . " ({$snapshot['dss_category']}" . ($snapshot['dss_rank'] ? ", rank {$snapshot['dss_rank']}" : "") . ")" : "")
    );

    $conn->commit();
} catch (Exception $e) {
    if ($conn->inTransaction()) $conn->rollBack();
    http_response_code(500);
    error_log("relief/approve_allocation.php: " . $e->getMessage());
    echo json_encode(["success" => false, "message" => "We couldn't approve this relief allocation. Please try again."]);
    exit();
}

// Phase 25: in-app notice only (SMS is sent when the allocation is marked Ready, F-SMS-01).
// Phase 20 — automated SMS, AFTER the approval is committed. dispatch_notification()
// never throws, so a TextBee failure cannot undo the approval; the attempt is
// logged in SMS Logs (Sent / Failed / Not Configured). The event key
// "allocation:<id>:approved" + the unique keys on notifications / sms_logs make
// the event fire at most once per household number, even on repeated calls.
$sms_summary = dispatch_notification($conn, [['household_id' => intval($allocation['household_id'])]],
    "allocation:$allocation_id:approved", "Relief allocation approved",
    "Your relief allocation ($quantity $unit of {$item['item_name']}) has been approved. Please wait for the scheduled distribution details. For inquiries, contact the barangay office.",
    ['link' => '/resident/relief-status', 'sms' => sms_on_approval_and_distribution(), 'sms_category' => 'Relief Allocation Update',
     'event_type' => 'ALLOCATION_APPROVED', 'allocation_id' => $allocation_id, 'sent_by' => $_SESSION['user_id']]);
$sms_note = describe_sms_result($sms_summary);

echo json_encode([
    "success" => true,
    "message" => "Relief Allocation approved. Stock will be deducted when it is distributed." . ($sms_note ? " $sms_note" : ""),
    "sms_status" => $sms_summary['sms']['status'] ?? null,
    "allocation_id" => $allocation_id,
    "approved_quantity" => $quantity,
    "available_after_approval" => $available - $quantity,
]);

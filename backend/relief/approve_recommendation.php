<?php
/**
 * Approve a relief recommendation (Phase 6; admin Modify + stock re-check Phase 17 Fix 2).
 *
 * The admin may approve the system-recommended quantity as-is or MODIFY it
 * first. Nothing sent by the browser is trusted:
 *   - household_id / item_id must exist
 *   - quantity must be a whole number >= 1 (0 = "do not allocate" -> use Reject)
 *   - the household must not already have a Pending/Approved allocation for
 *     this item (same duplicate rule the recommendation engine uses)
 *   - quantity must not exceed the item's AVAILABLE stock, using the same
 *     rule as relief_recommendations.php (Fix 1):
 *         available = MAX(0, current stock - SUM(Approved, not yet distributed))
 *     The item row is locked (SELECT ... FOR UPDATE, as distribute.php does)
 *     inside a transaction, so two admins approving from stale pages cannot
 *     both commit the same units.
 *   - the system-recommended quantity and reason are recomputed here on the
 *     server (not taken from the browser) and stored in recommendation_reason
 *     together with the admin's final quantity.
 *
 * Approving does NOT deduct inventory (unchanged): stock only leaves
 * relief_items when the allocation is distributed (distribute.php).
 */
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../lib/allocation_service.php';
require_once __DIR__ . '/../lib/notify.php';

require_login(['admin']);

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(["success" => false, "message" => "Method not allowed."]);
    exit();
}

$data = json_decode(file_get_contents("php://input"), true);
if (!is_array($data)) $data = [];

// Strict whole-number parsing: "2.5", "5abc", "", null and -5 are all rejected
// (intval() would have silently turned "2.5" into 2).
function parse_whole_number($value)
{
    if (is_int($value)) return $value;
    if (is_string($value) && preg_match('/^\s*\d+\s*$/', $value)) return intval($value);
    if (is_float($value) && floor($value) == $value) return intval($value);
    return null;
}

$household_id = parse_whole_number($data['household_id'] ?? null);
$item_id = parse_whole_number($data['item_id'] ?? null);
$quantity = parse_whole_number($data['quantity'] ?? null);

if (!$household_id || !$item_id) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "The household or relief item is missing. Please refresh the page and try again."]);
    exit();
}
if ($quantity === null) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "Approval quantity must be a whole number."]);
    exit();
}
if ($quantity <= 0) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "Quantity to approve must be at least 1. To skip this item, select Reject."]);
    exit();
}

$database = new Database();
$conn = $database->connect();

$hh = $conn->prepare("SELECT household_id FROM households WHERE household_id = :household_id");
$hh->execute([':household_id' => $household_id]);
if (!$hh->fetch()) {
    http_response_code(404);
    echo json_encode(["success" => false, "message" => "Household not found."]);
    exit();
}

/**
 * The system's current recommendation for this household + item, recomputed
 * server-side by the Fix 1 engine (run in its own function scope so its
 * variables don't collide with this file's). Returns null if the engine has
 * no recommendation for that pair right now.
 */
function current_system_recommendation($target_household_id, $target_item_id)
{
    // The included engine reuses names like $household_id / $item / $h in this
    // function's scope, so the targets must use names it never assigns, and the
    // captured response is kept under its own name too.
    $__rec_targets = [intval($target_household_id), intval($target_item_id)];
    ob_start();
    include __DIR__ . '/../dashboard/relief_recommendations.php';
    $__rec_response = json_decode(ob_get_clean(), true);
    foreach ($__rec_response['data'] ?? [] as $__rec_h) {
        if (intval($__rec_h['household_id']) !== $__rec_targets[0]) continue;
        foreach ($__rec_h['recommendations'] as $__rec_r) {
            if (intval($__rec_r['item_id']) === $__rec_targets[1]) return $__rec_r;
        }
    }
    return null;
}
// Phase 25: compare with the recommendation in the sharing mode the official was viewing.
$_GET['mode'] = (($data['mode'] ?? '') === 'minimum_share') ? 'minimum_share' : 'full_need';
$system_rec = current_system_recommendation($household_id, $item_id);

// Phase 25 (F-DSS-02): serving a household the DSS does not currently recommend
// for this item is an EXCEPTION. It goes through the Emergency Override, which
// requires a written reason and is labelled in the records — not through this
// ordinary approval.
if (!$system_rec) {
    http_response_code(409);
    echo json_encode(["success" => false, "code" => "no_recommendation",
        "message" => "The DSS has no current recommendation for this household and item. If relief is urgently needed, use Emergency Override and record the reason."]);
    exit();
}
// Phase 25 (F-DSS-04): the decision snapshot, from the same figures the recommendation used.
$snapshot = dss_snapshot_for_household($conn, $household_id);

// The item's unit is read BEFORE the transaction: a plain read inside it would
// open the transaction's snapshot before the stock lock (see allocation_service.php).
$unit_stmt = $conn->prepare("SELECT unit FROM relief_items WHERE item_id = :item_id");
$unit_stmt->execute([':item_id' => $item_id]);
$unit = (string) $unit_stmt->fetchColumn();

try {
    $conn->beginTransaction();

    // Phase 19: the locked stock check + duplicate check + Approved insert
    // live in lib/allocation_service.php so every path uses the same rules.

    // Keep the system's recommendation and reason; record the admin's decision next to it.
    if ($system_rec) {
        $recommended_qty = intval($system_rec['quantity_to_allocate']);
        $reason = "System recommended $recommended_qty $unit: " . $system_rec['reason'] . ".";
    } else {
        $recommended_qty = null;
        $reason = "No current system recommendation for this household and item.";
    }
    if ($recommended_qty === $quantity) {
        $reason .= " Administrator approved the recommended quantity.";
    } else {
        $reason .= " Administrator approved $quantity $unit (changed from the system recommendation).";
    }

    // Recommendation review IS the approval step, so this allocation is created
    // directly as Approved, with the approver and timestamp recorded.
    $result = create_approved_allocation_locked($conn, $household_id, $item_id, $quantity, $reason, intval($_SESSION['user_id']), null, $snapshot);

    if (!$result['ok']) {
        $conn->rollBack();
        http_response_code($result['code']);
        if ($result['reason'] === 'duplicate') {
            echo json_encode(["success" => false, "message" => "This household already has a Pending or Approved Relief Allocation for this item. Please refresh the page."]);
        } elseif ($result['reason'] === 'insufficient_stock') {
            echo json_encode([
                "success" => false,
                "message" => $result['message'] . " The page will refresh with current figures.",
                "available" => $result['available'],
            ]);
        } else {
            echo json_encode(["success" => false, "message" => $result['message']]);
        }
        exit();
    }

    $allocation_id = $result['allocation_id'];

    $conn->commit();
} catch (Exception $e) {
    if ($conn->inTransaction()) $conn->rollBack();
    http_response_code(500);
    error_log("relief/approve_recommendation.php: " . $e->getMessage());
    echo json_encode(["success" => false, "message" => "We couldn't approve this recommendation. Please try again."]);
    exit();
}

log_action(
    $conn,
    "Relief recommendation approved",
    "household_id: $household_id, item_id: $item_id, qty: $quantity"
        . ($recommended_qty === null ? ", no current system recommendation" : ", system recommended: $recommended_qty")
        . ($recommended_qty === $quantity ? "" : " (modified by admin)")
);

// Phase 20 — automated SMS after COMMIT (see relief/approve_allocation.php).
$item_row = $conn->prepare("SELECT item_name, unit FROM relief_items WHERE item_id = :id");
$item_row->execute([':id' => $item_id]);
$item_info = $item_row->fetch(PDO::FETCH_ASSOC) ?: ['item_name' => 'relief item', 'unit' => ''];
$sms_summary = dispatch_notification($conn, [['household_id' => $household_id]],
    "allocation:$allocation_id:approved", "Relief allocation approved",
    "Your relief allocation ($quantity {$item_info['unit']} of {$item_info['item_name']}) has been approved. Please wait for the scheduled distribution details. For inquiries, contact the barangay office.",
    ['link' => '/resident/relief-status', 'sms' => sms_on_approval_and_distribution(), 'sms_category' => 'Relief Allocation Update',
     'event_type' => 'ALLOCATION_APPROVED', 'allocation_id' => $allocation_id, 'sent_by' => $_SESSION['user_id']]);
$sms_note = describe_sms_result($sms_summary);

http_response_code(201);
echo json_encode([
    "success" => true,
    "message" => "Recommendation approved. A Relief Allocation has been created with Approved status." . ($sms_note ? " $sms_note" : ""),
    "sms_status" => $sms_summary['sms']['status'] ?? null,
    "allocation_id" => $allocation_id,
    "approved_quantity" => $quantity,
    "system_recommended_quantity" => $recommended_qty,
]);

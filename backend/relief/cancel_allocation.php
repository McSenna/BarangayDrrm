<?php
/**
 * Cancel a relief allocation (Phase 25, audit F-ALLOC-03) — Administrator only.
 *
 * Pending or Approved (including Ready for Distribution) -> Cancelled.
 *   - a written reason is required (5–500 characters)
 *   - the allocation row is locked (SELECT ... FOR UPDATE); a repeated or
 *     concurrent request finds it already Cancelled and gets 409
 *   - Distributed allocations cannot be cancelled here (the relief was handed
 *     out and stock already deducted; a correction is a stock adjustment)
 *   - nothing is deleted: the row stays with cancelled_by / cancelled_at /
 *     cancel_reason for the audit trail
 *   - stock: an Approved allocation reserved stock (it counted in
 *     "committed"); once Cancelled it no longer counts, so the reservation is
 *     released automatically. relief_items.quantity is NOT changed, because
 *     approval never deducted it — so the ledger stays consistent.
 *   - if the household had already been told it was Ready, it gets an in-app
 *     notice; staff should also tell it in person (no automatic SMS here).
 * POST {allocation_id, reason}
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
$bad = function ($msg, $code = 400) {
    http_response_code($code);
    echo json_encode(["success" => false, "message" => $msg]);
    exit();
};

$allocation_id = allocation_input_int($data['allocation_id'] ?? null);
$reason = is_string($data['reason'] ?? null) ? trim(preg_replace('/\s+/', ' ', $data['reason'])) : '';
if ($allocation_id <= 0) $bad("The allocation could not be found. Please refresh the page and try again.");
if (mb_strlen($reason) < 5) $bad("Please give the reason for cancelling (at least 5 characters).");
if (mb_strlen($reason) > 500) $bad("Please keep the reason within 500 characters.");

$conn = (new Database())->connect();
if (!allocation_phase25_ready($conn)) {
    $bad("Cancelling needs the Phase 25 database update (database/migration_phase25_official_assessment_dss_allocation.sql).", 503);
}

try {
    $conn->beginTransaction();
    $st = $conn->prepare(
        "SELECT ra.allocation_id, ra.household_id, ra.item_id, ra.quantity, ra.status, ra.ready_at, h.head_of_family, i.item_name, i.unit
         FROM relief_allocations ra JOIN households h ON h.household_id = ra.household_id JOIN relief_items i ON i.item_id = ra.item_id
         WHERE ra.allocation_id = :id FOR UPDATE"
    );
    $st->execute([':id' => $allocation_id]);
    $a = $st->fetch(PDO::FETCH_ASSOC);
    if (!$a) { $conn->rollBack(); $bad("Allocation not found.", 404); }
    if ($a['status'] === 'Cancelled') { $conn->rollBack(); $bad("This allocation is already cancelled.", 409); }
    if ($a['status'] === 'Distributed') {
        $conn->rollBack();
        $bad("This allocation was already distributed and cannot be cancelled. If the record is wrong, correct the stock with an Adjustment and note the reason.", 409);
    }
    $was = $a['status'] === 'Approved' ? ($a['ready_at'] ? 'Ready for Distribution' : 'Approved') : 'Pending';
    $u = $conn->prepare(
        "UPDATE relief_allocations SET status = 'Cancelled', cancelled_by = :by, cancelled_at = NOW(), cancel_reason = :r
         WHERE allocation_id = :id AND status IN ('Pending','Approved')"
    );
    $u->execute([':by' => $_SESSION['user_id'], ':r' => $reason, ':id' => $allocation_id]);
    if ($u->rowCount() !== 1) { $conn->rollBack(); $bad("This allocation changed while saving. Please refresh and try again.", 409); }
    log_action($conn, "Relief allocation cancelled",
        "allocation_id: $allocation_id, household_id: {$a['household_id']} ({$a['head_of_family']}), {$a['quantity']} {$a['unit']} of {$a['item_name']}, was: $was"
        . ($was !== 'Pending' ? ", reserved stock released" : "") . ", reason: $reason");
    $conn->commit();
} catch (Throwable $e) {
    if ($conn->inTransaction()) $conn->rollBack();
    error_log("relief/cancel_allocation.php: " . $e->getMessage());
    $bad("We couldn't cancel this allocation. Please try again.", 500);
}

if ($was === 'Ready for Distribution') {
    dispatch_notification($conn, [['household_id' => intval($a['household_id'])]],
        "allocation:$allocation_id:cancelled", "Relief schedule cancelled",
        "The relief scheduled for your household ({$a['quantity']} {$a['unit']} of {$a['item_name']}) was cancelled by the barangay. Please contact the barangay office.",
        ['link' => '/resident/relief-status', 'sms' => false]);
}

echo json_encode([
    "success" => true,
    "message" => "Allocation cancelled ({$a['quantity']} {$a['unit']} of {$a['item_name']} for {$a['head_of_family']})."
        . ($was !== 'Pending' ? " The reserved stock is available again." : "")
        . ($was === 'Ready for Distribution' ? " The household was told it was ready: please also inform them in person." : ""),
    "previous_status" => $was,
]);

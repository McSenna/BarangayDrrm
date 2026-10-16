<?php
/**
 * Emergency Override (Phase 25, audit F-DSS-02) — Administrator only.
 *
 * Serves a household immediately, regardless of its DSS score or whether it
 * has been assessed yet, when a documented emergency requires it. A numerical
 * score must never delay life-saving help; field responders still follow the
 * barangay's emergency procedures, and this records the relief decision.
 *
 * What it does NOT relax:
 *   - a written reason is REQUIRED (10–500 characters)
 *   - the item row is locked and AVAILABLE stock is re-checked (never negative,
 *     never more than available) — lib/allocation_service.php
 *   - the one-active-allocation-per-household-and-item duplicate rule
 *
 * The allocation is created Approved, labelled is_emergency_override = 1 with
 * the reason, the approver and time, the household's DSS snapshot at that
 * moment, and the disaster event when given. It is written to the audit log
 * and appears in reports. The household gets an in-app notice; the SMS comes
 * when the allocation is marked Ready for Distribution.
 *
 * POST {household_id, item_id, quantity, reason, event_id?}
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
$bad = function ($msg, $code = 400, $extra = []) {
    http_response_code($code);
    echo json_encode(array_merge(["success" => false, "message" => $msg], $extra));
    exit();
};

$household_id = allocation_input_int($data['household_id'] ?? null);
$item_id = allocation_input_int($data['item_id'] ?? null);
$quantity = allocation_input_int($data['quantity'] ?? null);
$event_id = isset($data['event_id']) && $data['event_id'] !== '' && $data['event_id'] !== null ? allocation_input_int($data['event_id']) : 0;
$reason = is_string($data['reason'] ?? null) ? trim(preg_replace('/\s+/', ' ', $data['reason'])) : '';

if ($household_id <= 0 || $item_id <= 0) $bad("Please choose the household and the relief item.");
if ($quantity <= 0) $bad("Please enter a whole-number quantity of at least 1.");
if (mb_strlen($reason) < 10) $bad("An emergency override needs a written reason (at least 10 characters), e.g. what was observed and by whom.");
if (mb_strlen($reason) > 500) $bad("Please keep the reason within 500 characters.");

$conn = (new Database())->connect();
if (!allocation_phase25_ready($conn)) {
    $bad("Emergency override needs the Phase 25 database update (database/migration_phase25_official_assessment_dss_allocation.sql).", 503);
}

$hh = $conn->prepare("SELECT household_id, head_of_family FROM households WHERE household_id = :id");
$hh->execute([':id' => $household_id]);
$household = $hh->fetch(PDO::FETCH_ASSOC);
if (!$household) $bad("Household not found.", 404);
if ($event_id) {
    $ev = $conn->prepare("SELECT event_id FROM disaster_events WHERE event_id = :id");
    $ev->execute([':id' => $event_id]);
    if (!$ev->fetch()) $bad("The selected disaster event could not be found.", 404);
}

$snapshot = dss_snapshot_for_household($conn, $household_id);
$score_text = $snapshot['dss_score'] !== null ? "DSS {$snapshot['dss_score']} ({$snapshot['dss_category']}" . ($snapshot['dss_rank'] ? ", rank {$snapshot['dss_rank']}" : "") . ")" : "DSS: {$snapshot['dss_category']}";

try {
    $conn->beginTransaction();
    $result = create_approved_allocation_locked(
        $conn, $household_id, $item_id, $quantity,
        "EMERGENCY OVERRIDE by the Administrator: $reason [$score_text at the time of the override]",
        intval($_SESSION['user_id']), null, $snapshot,
        ['override_reason' => $reason, 'event_id' => $event_id ?: null]
    );
    if (!$result['ok']) {
        $conn->rollBack();
        $msg = $result['reason'] === 'insufficient_stock'
            ? $result['message'] . " The override cannot exceed available stock."
            : $result['message'];
        $bad($msg, $result['code'], ["available" => $result['available']]);
    }
    $allocation_id = $result['allocation_id'];
    log_action($conn, "Emergency override allocation",
        "allocation_id: $allocation_id, household_id: $household_id ({$household['head_of_family']}), item_id: $item_id ({$result['item']['item_name']}), "
        . "qty: $quantity {$result['item']['unit']}, $score_text" . ($event_id ? ", event_id: $event_id" : "") . ", reason: $reason");
    $conn->commit();
} catch (Throwable $e) {
    if ($conn->inTransaction()) $conn->rollBack();
    error_log("relief/emergency_override.php: " . $e->getMessage());
    $bad("We couldn't record the emergency override. Please try again.", 500);
}

dispatch_notification($conn, [['household_id' => $household_id]],
    "allocation:$allocation_id:approved", "Relief allocation approved",
    "Relief has been approved for your household ($quantity {$result['item']['unit']} of {$result['item']['item_name']}). You will be told when and where to receive it.",
    ['link' => '/resident/relief-status', 'sms' => sms_on_approval_and_distribution(), 'sms_category' => 'Relief Allocation Update',
     'event_type' => 'ALLOCATION_APPROVED', 'allocation_id' => $allocation_id, 'sent_by' => $_SESSION['user_id']]);

http_response_code(201);
echo json_encode([
    "success" => true,
    "message" => "Emergency override recorded: $quantity {$result['item']['unit']} of {$result['item']['item_name']} approved for {$household['head_of_family']}. "
               . "It is labelled as an override with your reason. Mark it Ready for Distribution to notify the household by SMS.",
    "allocation_id" => $allocation_id,
    "dss_snapshot" => $snapshot,
]);

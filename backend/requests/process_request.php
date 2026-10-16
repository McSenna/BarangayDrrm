<?php
/**
 * Process an Approved / Partially Approved relief request into relief
 * allocations (Phase 19).
 *
 * Uses the EXISTING stock-safe allocation logic (lib/allocation_service.php,
 * the same code relief/approve_recommendation.php uses): item rows locked in
 * item_id order, duplicate-allocation check, and
 *     available = MAX(0, current stock - SUM(Approved, not yet distributed)).
 * One transaction for the whole request: if any line fails, nothing is
 * created and the request stays as it was. The allocations are created as
 * Approved (stock reserved, not deducted); distribution deducts stock.
 */
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../lib/allocation_service.php';
require_once __DIR__ . '/../lib/requests.php';
require_once __DIR__ . '/../lib/notify.php';

require_login(['admin']);

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(["success" => false, "message" => "Method not allowed."]);
    exit();
}

$data = json_decode(file_get_contents("php://input"), true);
$request_id = intval($data['request_id'] ?? 0);
if ($request_id <= 0) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "Relief request not specified."]);
    exit();
}

$database = new Database();
$conn = $database->connect();

// DSS snapshot recorded in each allocation's reason (read before the transaction; unchanged algorithm).
$pre = $conn->prepare("SELECT household_id FROM relief_requests WHERE request_id = :id");
$pre->execute([':id' => $request_id]);
$pre_household = $pre->fetchColumn();
$priority = $pre_household ? (dss_priority_by_household()[intval($pre_household)] ?? null) : null;
$snapshot = $pre_household ? dss_snapshot_for_household($conn, intval($pre_household)) : null; // Phase 25 (F-DSS-04)

$created = [];
try {
    $conn->beginTransaction();

    $req_stmt = $conn->prepare("SELECT request_id, household_id, user_id, urgency, status FROM relief_requests WHERE request_id = :id FOR UPDATE");
    $req_stmt->execute([':id' => $request_id]);
    $request = $req_stmt->fetch(PDO::FETCH_ASSOC);
    if (!$request) {
        $conn->rollBack();
        http_response_code(404);
        echo json_encode(["success" => false, "message" => "Relief request not found."]);
        exit();
    }
    if (!in_array($request['status'], ['Approved', 'Partially Approved'], true)) {
        $conn->rollBack();
        http_response_code(409);
        echo json_encode(["success" => false, "message" => "Only Approved or Partially Approved requests can be processed into allocations. This request is {$request['status']}."]);
        exit();
    }

    $lines = $conn->prepare(
        "SELECT ri.request_item_id, ri.item_id, ri.requested_quantity, ri.approved_quantity, i.unit, i.item_name
         FROM relief_request_items ri JOIN relief_items i ON i.item_id = ri.item_id
         WHERE ri.request_id = :id AND ri.approved_quantity > 0
         ORDER BY ri.item_id ASC"
    );
    $lines->execute([':id' => $request_id]);
    $lines = $lines->fetchAll(PDO::FETCH_ASSOC);
    if (empty($lines)) {
        $conn->rollBack();
        http_response_code(409);
        echo json_encode(["success" => false, "message" => "No approved quantities to process."]);
        exit();
    }

    $dss_text = $priority
        ? "DSS priority at processing: score {$priority['priority_score']} ({$priority['priority_level']})."
        : "DSS priority unavailable at processing.";

    foreach ($lines as $line) {
        $qty = intval($line['approved_quantity']);
        $reason = "Relief request #$request_id ({$request['urgency']} urgency): resident requested {$line['requested_quantity']} {$line['unit']}, "
                . "Administrator approved $qty {$line['unit']}. $dss_text";
        $result = create_approved_allocation_locked(
            $conn, intval($request['household_id']), intval($line['item_id']), $qty, $reason,
            intval($_SESSION['user_id']), intval($line['request_item_id']), $snapshot
        );
        if (!$result['ok']) {
            $conn->rollBack();
            http_response_code($result['code']);
            echo json_encode([
                "success" => false,
                "message" => $result['message'] . " No allocations were created. Adjust the approved quantity or add stock, then try again.",
                "item_id" => intval($line['item_id']),
                "available" => $result['available'],
            ]);
            exit();
        }
        $created[] = $result['allocation_id'];
    }

    $upd = $conn->prepare("UPDATE relief_requests SET status = 'Allocated', processed_by = :admin, processed_at = NOW() WHERE request_id = :id");
    $upd->execute([':admin' => $_SESSION['user_id'], ':id' => $request_id]);

    log_action($conn, "Relief request processed", "request_id: $request_id, allocations: " . implode(',', $created));
    $conn->commit();
} catch (Exception $e) {
    if ($conn->inTransaction()) $conn->rollBack();
    http_response_code(500);
    error_log("requests/process_request.php: " . $e->getMessage());
    echo json_encode(["success" => false, "message" => "We couldn't process this request. Please try again."]);
    exit();
}

// Phase 20 — automated SMS after COMMIT: ONE message per request (not one per
// item), listing the approved items. Event key "request:<id>:allocated".
$item_list = implode(', ', array_map(fn($l) => $l['item_name'] . ' ' . intval($l['approved_quantity']) . ' ' . $l['unit'], $lines));
$sms_summary = dispatch_notification($conn, [['household_id' => $request['household_id']]],
    "request:$request_id:allocated", "Relief allocation approved",
    "Your relief allocation for request #$request_id has been approved: $item_list. Please wait for the scheduled distribution details. For inquiries, contact the barangay office.",
    ['link' => '/resident/relief-status', 'sms' => sms_on_approval_and_distribution(), 'sms_category' => 'Relief Allocation Update',
     'event_type' => 'ALLOCATION_APPROVED', 'request_id' => $request_id, 'sent_by' => $_SESSION['user_id']]);
$sms_note = describe_sms_result($sms_summary);

echo json_encode([
    "success" => true,
    "message" => count($created) . " Relief Allocation(s) created with Approved status. Stock is reserved and will be deducted when distributed." . ($sms_note ? " $sms_note" : ""),
    "sms_status" => $sms_summary['sms']['status'] ?? null,
    "allocation_ids" => $created,
]);

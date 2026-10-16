<?php
/**
 * Administrator's decision on a relief request (Phase 19).
 *
 * Body: { request_id, decision: "approve" | "reject", remarks,
 *         items: [{ request_item_id, approved_quantity }] }   (approve only)
 *
 * - The status is computed on the server from the quantities, never taken
 *   from the browser: all lines approved in full -> Approved; anything less
 *   (but more than zero overall) -> Partially Approved; reject -> Rejected.
 * - approved_quantity is a whole number from 0 to the requested quantity.
 * - Allowed from Pending, Under Review, Approved or Partially Approved (a
 *   decision can be revised until the request is processed into allocations).
 * - No stock is reserved here. Stock is checked and reserved when the
 *   request is processed (process_request.php -> existing allocation rules).
 * - The resident is notified in-app and by SMS after the decision is saved.
 */
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../lib/notify.php';

require_login(['admin']);

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(["success" => false, "message" => "Method not allowed."]);
    exit();
}

$data = json_decode(file_get_contents("php://input"), true);
if (!is_array($data)) $data = [];
$request_id = intval($data['request_id'] ?? 0);
$decision = $data['decision'] ?? '';
$remarks = trim((string) ($data['remarks'] ?? ''));
$items_in = is_array($data['items'] ?? null) ? $data['items'] : [];

if ($request_id <= 0 || !in_array($decision, ['approve', 'reject'], true)) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "Please choose Approve or Reject."]);
    exit();
}
if ($decision === 'reject' && mb_strlen($remarks) < 3) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "Please enter the reason for rejecting this request. The resident will see it."]);
    exit();
}
if (mb_strlen($remarks) > 2000) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "Remarks must be 2,000 characters or fewer."]);
    exit();
}

$database = new Database();
$conn = $database->connect();

try {
    $conn->beginTransaction();

    $req_stmt = $conn->prepare("SELECT request_id, household_id, user_id, status FROM relief_requests WHERE request_id = :id FOR UPDATE");
    $req_stmt->execute([':id' => $request_id]);
    $request = $req_stmt->fetch(PDO::FETCH_ASSOC);
    if (!$request) {
        $conn->rollBack();
        http_response_code(404);
        echo json_encode(["success" => false, "message" => "Relief request not found."]);
        exit();
    }
    if (!in_array($request['status'], ['Pending', 'Under Review', 'Approved', 'Partially Approved'], true)) {
        $conn->rollBack();
        http_response_code(409);
        echo json_encode(["success" => false, "message" => "This request is already {$request['status']} and can no longer be changed."]);
        exit();
    }

    $lines_stmt = $conn->prepare("SELECT request_item_id, requested_quantity FROM relief_request_items WHERE request_id = :id");
    $lines_stmt->execute([':id' => $request_id]);
    $lines = [];
    foreach ($lines_stmt->fetchAll(PDO::FETCH_ASSOC) as $l) {
        $lines[intval($l['request_item_id'])] = intval($l['requested_quantity']);
    }

    $approved = [];
    if ($decision === 'approve') {
        foreach ($items_in as $in) {
            $rid = intval($in['request_item_id'] ?? 0);
            $qty = $in['approved_quantity'] ?? null;
            if (!isset($lines[$rid])) {
                $conn->rollBack();
                http_response_code(400);
                echo json_encode(["success" => false, "message" => "An item does not belong to this request. Please refresh the page."]);
                exit();
            }
            if (!is_numeric($qty) || intval($qty) != $qty || intval($qty) < 0 || intval($qty) > $lines[$rid]) {
                $conn->rollBack();
                http_response_code(400);
                echo json_encode(["success" => false, "message" => "Approved quantities must be whole numbers from 0 up to the requested quantity."]);
                exit();
            }
            $approved[$rid] = intval($qty);
        }
        if (count($approved) !== count($lines)) {
            $conn->rollBack();
            http_response_code(400);
            echo json_encode(["success" => false, "message" => "Please enter an approved quantity for every requested item (0 to skip an item)."]);
            exit();
        }
        if (array_sum($approved) === 0) {
            $conn->rollBack();
            http_response_code(400);
            echo json_encode(["success" => false, "message" => "No quantity was approved. To decline the request, choose Reject and give a reason."]);
            exit();
        }
        $full = true;
        foreach ($approved as $rid => $qty) {
            if ($qty < $lines[$rid]) $full = false;
        }
        $new_status = $full ? 'Approved' : 'Partially Approved';
    } else {
        foreach ($lines as $rid => $q) $approved[$rid] = 0;
        $new_status = 'Rejected';
    }

    $upd_item = $conn->prepare("UPDATE relief_request_items SET approved_quantity = :qty WHERE request_item_id = :rid AND request_id = :req");
    foreach ($approved as $rid => $qty) {
        $upd_item->execute([':qty' => $qty, ':rid' => $rid, ':req' => $request_id]);
    }

    $upd = $conn->prepare("UPDATE relief_requests SET status = :status, admin_remarks = :remarks, reviewed_by = :admin, reviewed_at = NOW() WHERE request_id = :id");
    $upd->execute([':status' => $new_status, ':remarks' => $remarks !== '' ? $remarks : null, ':admin' => $_SESSION['user_id'], ':id' => $request_id]);

    log_action($conn, "Relief request $new_status", "request_id: $request_id, household_id: {$request['household_id']}"
        . ($decision === 'approve' ? ", approved total: " . array_sum($approved) . " of " . array_sum($lines) : "")
        . ($remarks !== '' ? ", remarks: " . mb_substr($remarks, 0, 150) : ""));

    $conn->commit();
} catch (Exception $e) {
    if ($conn->inTransaction()) $conn->rollBack();
    http_response_code(500);
    error_log("requests/decide_request.php: " . $e->getMessage());
    echo json_encode(["success" => false, "message" => "We couldn't save the decision. Please try again."]);
    exit();
}

// After COMMIT: notify the resident (in-app + SMS). Failures never affect the decision.
$messages = [
    'Approved' => "Your relief request #$request_id was approved. The barangay will prepare your relief.",
    'Partially Approved' => "Your relief request #$request_id was partially approved. Please check the approved quantities in the system.",
    'Rejected' => "Your relief request #$request_id was not approved. Reason: " . mb_substr($remarks, 0, 160),
];
$summary = dispatch_notification($conn, [['household_id' => $request['household_id']]],
    "request:$request_id:decision:" . strtolower(str_replace(' ', '_', $new_status)),
    "Relief request $new_status", $messages[$new_status],
    ['link' => '/resident/relief-status', 'sms' => sms_on_approval_and_distribution(), 'sms_category' => 'Relief Request Update', 'sent_by' => $_SESSION['user_id']]);

echo json_encode([
    "success" => true,
    "message" => "Request marked as $new_status." . (describe_sms_result($summary) ? " " . describe_sms_result($summary) : ""),
    "status" => $new_status,
]);

<?php
/**
 * Record a relief request for a household (Phase 19; Phase 21 revision).
 *
 * Phase 21: residents no longer submit relief requests. The Administrator /
 * Barangay Official records a household's relief request (e.g. from a field
 * assessment or a walk-in at the barangay office) and it then follows the
 * existing review -> approval -> allocation workflow. household_id is
 * required and validated server-side. Only one open request per household is
 * allowed (checked under a row lock to prevent double submits).
 */
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../lib/requests.php';

require_login(['admin']); // Phase 21: residents can no longer submit relief requests

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(["success" => false, "message" => "Method not allowed."]);
    exit();
}

$data = json_decode(file_get_contents("php://input"), true);
if (!is_array($data)) $data = [];

$urgency = $data['urgency'] ?? 'Medium';
$reason = trim((string) ($data['reason'] ?? ''));
$report_id = !empty($data['report_id']) ? intval($data['report_id']) : null;
$items_in = is_array($data['items'] ?? null) ? $data['items'] : [];
$raw_household = $data['household_id'] ?? null;
$household_id = (is_int($raw_household) || (is_string($raw_household) && preg_match('/^\s*\d+\s*$/', $raw_household)))
    ? intval($raw_household) : 0;
if ($household_id <= 0) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "Please select the household this relief request is for."]);
    exit();
}

if (!in_array($urgency, RELIEF_REQUEST_URGENCY, true)) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "Please select the urgency of the request."]);
    exit();
}
if (mb_strlen($reason) < 10 || mb_strlen($reason) > 2000) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "Please explain why the household needs relief (at least 10 characters)."]);
    exit();
}

// Items: whole-number quantities, no duplicates, 1 to 20 lines.
$items = [];
foreach ($items_in as $line) {
    $item_id = $line['item_id'] ?? null;
    $qty = $line['quantity'] ?? null;
    if (!is_numeric($item_id) || !is_numeric($qty) || intval($item_id) != $item_id || intval($qty) != $qty) {
        http_response_code(400);
        echo json_encode(["success" => false, "message" => "Each requested item needs a whole-number quantity."]);
        exit();
    }
    $item_id = intval($item_id);
    $qty = intval($qty);
    if ($item_id <= 0 || $qty < 1 || $qty > 10000) {
        http_response_code(400);
        echo json_encode(["success" => false, "message" => "Requested quantities must be between 1 and 10,000."]);
        exit();
    }
    if (isset($items[$item_id])) {
        http_response_code(400);
        echo json_encode(["success" => false, "message" => "Each relief item can only be listed once."]);
        exit();
    }
    $items[$item_id] = $qty;
}
if (count($items) < 1 || count($items) > 20) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "Please add at least one relief item (up to 20)."]);
    exit();
}

$database = new Database();
$conn = $database->connect();
$user_id = intval($_SESSION['user_id']);

$hh = $conn->prepare("SELECT household_id, head_of_family FROM households WHERE household_id = :id");
$hh->execute([':id' => $household_id]);
$household = $hh->fetch(PDO::FETCH_ASSOC);
if (!$household) {
    http_response_code(404);
    echo json_encode(["success" => false, "message" => "The selected household could not be found."]);
    exit();
}

// Optional disaster report link: must belong to this household, and not be Rejected.
if ($report_id !== null) {
    $rep = $conn->prepare("SELECT report_id, status FROM disaster_reports WHERE report_id = :report_id AND household_id = :household_id");
    $rep->execute([':report_id' => $report_id, ':household_id' => $household_id]);
    $report = $rep->fetch(PDO::FETCH_ASSOC);
    if (!$report) {
        http_response_code(400);
        echo json_encode(["success" => false, "message" => "The selected disaster report does not belong to this household."]);
        exit();
    }
    if ($report['status'] === 'Rejected') {
        http_response_code(400);
        echo json_encode(["success" => false, "message" => "A rejected disaster report cannot be linked to a relief request."]);
        exit();
    }
}

// Every item must exist.
$placeholders = implode(',', array_fill(0, count($items), '?'));
$check = $conn->prepare("SELECT item_id FROM relief_items WHERE item_id IN ($placeholders)");
$check->execute(array_keys($items));
if (count($check->fetchAll(PDO::FETCH_COLUMN)) !== count($items)) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "One of the selected relief items is no longer available. Please refresh the page."]);
    exit();
}

try {
    $conn->beginTransaction();

    // Lock the household row so two submissions at the same time cannot both pass the open-request check.
    $conn->prepare("SELECT household_id FROM households WHERE household_id = :id FOR UPDATE")->execute([':id' => $household_id]);

    $open_placeholders = implode(',', array_fill(0, count(RELIEF_REQUEST_OPEN_STATUSES), '?'));
    $open = $conn->prepare("SELECT request_id, status FROM relief_requests WHERE household_id = ? AND status IN ($open_placeholders) LIMIT 1");
    $open->execute(array_merge([$household_id], RELIEF_REQUEST_OPEN_STATUSES));
    $existing = $open->fetch(PDO::FETCH_ASSOC);
    if ($existing) {
        $conn->rollBack();
        http_response_code(409);
        echo json_encode([
            "success" => false,
            "code" => "open_request_exists",
            "message" => "This household already has an open relief request (#{$existing['request_id']}, {$existing['status']}). A new request can be recorded after it is completed or rejected.",
            "request_id" => intval($existing['request_id']),
        ]);
        exit();
    }

    $ins = $conn->prepare(
        "INSERT INTO relief_requests (household_id, user_id, report_id, urgency, reason, status)
         VALUES (:household_id, :user_id, :report_id, :urgency, :reason, 'Pending')"
    );
    $ins->execute([
        ':household_id' => $household_id,
        ':user_id' => $user_id,
        ':report_id' => $report_id,
        ':urgency' => $urgency,
        ':reason' => $reason,
    ]);
    $request_id = intval($conn->lastInsertId());

    $item_stmt = $conn->prepare("INSERT INTO relief_request_items (request_id, item_id, requested_quantity) VALUES (:request_id, :item_id, :qty)");
    foreach ($items as $item_id => $qty) {
        $item_stmt->execute([':request_id' => $request_id, ':item_id' => $item_id, ':qty' => $qty]);
    }

    log_action($conn, "Relief request recorded", "request_id: $request_id, household_id: $household_id ({$household['head_of_family']}), items: " . count($items) . ", urgency: $urgency");
    $conn->commit();
} catch (Exception $e) {
    if ($conn->inTransaction()) $conn->rollBack();
    http_response_code(500);
    error_log("requests/create_request.php: " . $e->getMessage());
    echo json_encode(["success" => false, "message" => "We couldn't record the relief request. Please try again."]);
    exit();
}

http_response_code(201);
echo json_encode(["success" => true, "message" => "Relief request #$request_id recorded for {$household['head_of_family']}. It is Pending review.", "request_id" => $request_id]);

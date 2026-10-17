<?php
/**
 * One relief request with everything needed to review it (Phase 19).
 *
 * Resident (own household only): request, items, approved quantities,
 * remarks and linked report.
 * Admin: additionally the household profile, damage assessment, the
 * household's DSS priority score/level/breakdown (unchanged algorithm), the
 * DSS needs estimate and current engine recommendation for each requested
 * item, available stock and shortage. Request information is displayed next
 * to the DSS results; it does not change the score.
 */
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../lib/requests.php';
require_once __DIR__ . '/../lib/dss.php';
require_once __DIR__ . '/../lib/allocation_service.php';

require_login(['admin']); // Phase 21: residents no longer submit or view relief requests

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(["success" => false, "message" => "Method not allowed."]);
    exit();
}

$request_id = intval($_GET['request_id'] ?? 0);
if ($request_id <= 0) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "Relief request not specified."]);
    exit();
}

$database = new Database();
$conn = $database->connect();

$stmt = $conn->prepare(
    "SELECT r.*, h.head_of_family, h.purok, h.address, h.number_of_members, h.vulnerable_members,
            h.children_count, h.seniors_count, h.pwd_count, h.pregnant_count, h.medical_needs_count, h.other_vulnerable_count,
            h.contact_number AS household_contact,
            u.full_name AS requested_by_name, u.contact_number AS requested_by_contact,
            rv.full_name AS reviewed_by_name, pr.full_name AS processed_by_name
     FROM relief_requests r
     JOIN households h ON h.household_id = r.household_id
     LEFT JOIN users u ON u.user_id = r.user_id
     LEFT JOIN users rv ON rv.user_id = r.reviewed_by
     LEFT JOIN users pr ON pr.user_id = r.processed_by
     WHERE r.request_id = :id"
);
$stmt->execute([':id' => $request_id]);
$request = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$request) {
    http_response_code(404);
    echo json_encode(["success" => false, "message" => "Relief request not found."]);
    exit();
}

$is_admin = $_SESSION['role'] === 'admin';
if (!$is_admin && !resident_can_view_request($conn, $request, intval($_SESSION['user_id']))) {
    // Same response as "not found" so residents cannot probe other households' requests.
    http_response_code(404);
    echo json_encode(["success" => false, "message" => "Relief request not found."]);
    exit();
}

$items = request_items_detail($conn, $request_id);

$report = null;
$assessment = null;
if ($request['report_id']) {
    $rep = $conn->prepare("SELECT report_id, disaster_type, location, report_date, severity, status, verification_remarks, description FROM disaster_reports WHERE report_id = :id");
    $rep->execute([':id' => $request['report_id']]);
    $report = $rep->fetch(PDO::FETCH_ASSOC) ?: null;
    $as = $conn->prepare("SELECT house_damage, infrastructure_damage, property_damage, agricultural_damage, estimated_severity, remarks, assessed_at FROM damage_assessments WHERE report_id = :id");
    $as->execute([':id' => $request['report_id']]);
    $assessment = $as->fetch(PDO::FETCH_ASSOC) ?: null;
}

if (!$is_admin) {
    // Residents see their own request details only — no DSS internals or other contacts.
    unset($request['household_contact'], $request['requested_by_contact'], $request['children_count'], $request['seniors_count'],
          $request['pwd_count'], $request['pregnant_count'], $request['medical_needs_count'], $request['other_vulnerable_count']);
    $resident_items = array_map(fn($i) => [
        'request_item_id' => $i['request_item_id'],
        'item_id' => $i['item_id'],
        'item_name' => $i['item_name'],
        'unit' => $i['unit'],
        'requested_quantity' => intval($i['requested_quantity']),
        'approved_quantity' => $i['approved_quantity'] === null ? null : intval($i['approved_quantity']),
        'allocation_status' => $i['allocation_status'],
    ], $items);
    echo json_encode(["success" => true, "data" => ["request" => $request, "items" => $resident_items, "report" => $report, "assessment" => $assessment]]);
    exit();
}

// ---- Admin: DSS information alongside the request ----
$household_id = intval($request['household_id']);
$priority = dss_priority_by_household()[$household_id] ?? null;
$engine = dss_recommendations_for_household($household_id);
$stock = available_stock_by_item($conn);

// Allocations this household already has open (duplicate rule awareness).
$open_alloc = $conn->prepare("SELECT item_id, allocation_id, status, quantity, request_item_id FROM relief_allocations WHERE household_id = :id AND status IN ('Pending','Approved')");
$open_alloc->execute([':id' => $household_id]);
$open_by_item = [];
foreach ($open_alloc->fetchAll(PDO::FETCH_ASSOC) as $a) {
    $open_by_item[intval($a['item_id'])] = $a;
}

$members = intval($request['number_of_members']);
$vulnerable = intval($request['vulnerable_members']);
foreach ($items as &$it) {
    $item_id = intval($it['item_id']);
    [$need, $need_reason] = dss_estimate_need((string) $it['category'], $members, $vulnerable);
    $s = $stock[$item_id] ?? ['available' => 0, 'current_stock' => 0, 'committed' => 0];
    $rec = $engine[$item_id] ?? null;
    $it['requested_quantity'] = intval($it['requested_quantity']);
    $it['approved_quantity'] = $it['approved_quantity'] === null ? null : intval($it['approved_quantity']);
    $it['dss_needs_estimate'] = $need;
    $it['dss_needs_rule'] = $need_reason;
    $it['dss_recommended_quantity'] = $rec ? intval($rec['quantity_to_allocate']) : null;
    $it['dss_recommendation_note'] = $rec
        ? $rec['reason']
        : (isset($open_by_item[$item_id])
            ? "Household already has an open allocation for this item (#{$open_by_item[$item_id]['allocation_id']}, {$open_by_item[$item_id]['status']})."
            : ($priority && !in_array($priority['priority_level'], ['Moderate Priority', 'High Priority', 'Critical Priority'], true)
                ? (!$priority['score_complete']
                    ? "No current recommendation: verify the incomplete household source data."
                    : "No recommendation currently available for this item; a Low provisional priority alone does not exclude this household.")
                : "No current recommendation for this item."));
    $it['current_stock'] = $s['current_stock'];
    $it['committed_stock'] = $s['committed'];
    $it['available_stock'] = $s['available'];
    $it['shortage'] = max(0, $it['requested_quantity'] - $s['available']);
    $it['open_allocation'] = $open_by_item[$item_id] ?? null;
}
unset($it);

echo json_encode([
    "success" => true,
    "data" => [
        "request" => $request,
        "items" => $items,
        "report" => $report,
        "assessment" => $assessment,
        "dss" => $priority ? [
            "automatic_subtotal" => $priority['automatic_subtotal'], "score_complete" => $priority['score_complete'], "provisional" => !$priority['score_complete'], "final_score" => $priority['final_score'],
            "number_of_members" => $priority['number_of_members'], "vulnerable_members" => $priority['vulnerable_members'],
            "assigned_field_officer_name" => $priority['assigned_field_officer_name'], "field_visit_date" => $priority['field_visit_date'],
            "priority_score" => $priority['priority_score'],
            "priority_level" => $priority['priority_level'],
            "score_breakdown" => $priority['score_breakdown'],
            "criteria" => $priority['criteria'],
            "rank" => $priority['rank'],
            "explanation" => $priority['explanation'],
            "assessment_status" => $priority['assessment_status'],
            "eligible" => $priority['eligible'],
            "needs_review" => $priority['needs_review'],
            "review_reasons" => $priority['review_reasons'],
            "unmet_needs" => $priority['unmet_needs'],
            "calculated_at" => $priority['calculated_at'],
            "vulnerability_score" => $priority['vulnerability_score'],
            "vulnerability_level" => $priority['vulnerability_level'],
            "latest_severity" => $priority['latest_severity'],
            "latest_report_status" => $priority['latest_report_status'],
        ] : null,
    ],
]);

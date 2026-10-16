<?php
/**
 * Relief request list (Phase 19).
 *   Resident: only their household's requests (household from the session).
 *   Admin:    all requests, with filters (status, urgency, purok, search,
 *             open=1) and the household's current DSS priority shown
 *             ALONGSIDE the request (the DSS score is not changed by requests).
 */
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../lib/requests.php';

require_login(['admin']); // Phase 21: residents no longer submit or view relief requests

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(["success" => false, "message" => "Method not allowed."]);
    exit();
}

$database = new Database();
$conn = $database->connect();

$select = "SELECT r.request_id, r.household_id, r.user_id, r.report_id, r.urgency, r.reason, r.status,
                  r.admin_remarks, r.reviewed_at, r.processed_at, r.created_at, r.updated_at,
                  h.head_of_family, h.purok, h.number_of_members, h.vulnerable_members,
                  u.full_name AS requested_by_name,
                  rv.full_name AS reviewed_by_name,
                  dr.disaster_type AS report_disaster_type, dr.severity AS report_severity, dr.status AS report_status,
                  (SELECT COUNT(*) FROM relief_request_items ri WHERE ri.request_id = r.request_id) AS item_count,
                  (SELECT COALESCE(SUM(ri.requested_quantity),0) FROM relief_request_items ri WHERE ri.request_id = r.request_id) AS total_requested,
                  (SELECT COALESCE(SUM(ri.approved_quantity),0) FROM relief_request_items ri WHERE ri.request_id = r.request_id) AS total_approved,
                  (SELECT GROUP_CONCAT(CONCAT(i.item_name, ' ×', ri.requested_quantity) ORDER BY i.item_name SEPARATOR ', ')
                     FROM relief_request_items ri JOIN relief_items i ON i.item_id = ri.item_id
                    WHERE ri.request_id = r.request_id) AS items_summary
           FROM relief_requests r
           JOIN households h ON h.household_id = r.household_id
           LEFT JOIN users u ON u.user_id = r.user_id
           LEFT JOIN users rv ON rv.user_id = r.reviewed_by
           LEFT JOIN disaster_reports dr ON dr.report_id = r.report_id";

if ($_SESSION['role'] === 'resident') {
    $user_id = intval($_SESSION['user_id']);
    $household = resident_household($conn, $user_id);
    $stmt = $conn->prepare($select . " WHERE r.user_id = :user_id OR r.household_id = :household_id ORDER BY r.created_at DESC, r.request_id DESC");
    $stmt->execute([':user_id' => $user_id, ':household_id' => $household ? intval($household['household_id']) : 0]);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $has_open = false;
    foreach ($rows as $r) {
        if ($household && intval($r['household_id']) === intval($household['household_id']) && in_array($r['status'], RELIEF_REQUEST_OPEN_STATUSES, true)) {
            $has_open = true;
        }
    }
    echo json_encode([
        "success" => true,
        "data" => $rows,
        "household" => $household,
        "household_linked" => $household !== null,
        "has_open_request" => $has_open,
    ]);
    exit();
}

// Admin
$where = " WHERE 1=1";
$params = [];
$status = $_GET['status'] ?? '';
if ($status === 'open') {
    $where .= " AND r.status IN ('" . implode("','", RELIEF_REQUEST_OPEN_STATUSES) . "')";
} elseif (in_array($status, RELIEF_REQUEST_STATUSES, true)) {
    $where .= " AND r.status = :status";
    $params[':status'] = $status;
}
$urgency = $_GET['urgency'] ?? '';
if (in_array($urgency, RELIEF_REQUEST_URGENCY, true)) {
    $where .= " AND r.urgency = :urgency";
    $params[':urgency'] = $urgency;
}
$purok = trim($_GET['purok'] ?? '');
if ($purok !== '') {
    $where .= " AND h.purok = :purok";
    $params[':purok'] = $purok;
}
$search = trim($_GET['search'] ?? '');
if ($search !== '') {
    $where .= " AND (h.head_of_family LIKE :search OR u.full_name LIKE :search OR r.reason LIKE :search)";
    $params[':search'] = "%$search%";
}

$stmt = $conn->prepare($select . $where . " ORDER BY FIELD(r.status,'Pending','Under Review','Approved','Partially Approved','Allocated','Distributed','Rejected'), r.created_at DESC");
$stmt->execute($params);
$rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

// DSS priority shown alongside each request (read-only, unchanged algorithm).
$priority = dss_priority_by_household();
foreach ($rows as &$row) {
    $p = $priority[intval($row['household_id'])] ?? null;
    $row['priority_score'] = $p['priority_score'] ?? null;
    $row['priority_level'] = $p['priority_level'] ?? null;
}
unset($row);

$counts = [];
foreach ($conn->query("SELECT status, COUNT(*) AS c FROM relief_requests GROUP BY status")->fetchAll(PDO::FETCH_ASSOC) as $c) {
    $counts[$c['status']] = intval($c['c']);
}

echo json_encode(["success" => true, "data" => $rows, "status_counts" => $counts]);

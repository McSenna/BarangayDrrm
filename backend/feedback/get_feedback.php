<?php
/**
 * Admin: relief feedback with filters and summary statistics (Phase 19).
 * Filters: type (schedule|request|allocation), rating, complaints_only=1,
 * received (Yes|No), purok, date_from, date_to.
 */
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';

require_login(['admin']);

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(["success" => false, "message" => "Method not allowed."]);
    exit();
}

$database = new Database();
$conn = $database->connect();

$where = " WHERE 1=1";
$params = [];
$type = $_GET['type'] ?? '';
if ($type === 'schedule') $where .= " AND f.beneficiary_id IS NOT NULL";
elseif ($type === 'request') $where .= " AND f.request_id IS NOT NULL";
elseif ($type === 'allocation') $where .= " AND f.allocation_id IS NOT NULL";
$rating = $_GET['rating'] ?? '';
if (in_array($rating, ['1', '2', '3', '4', '5'], true)) {
    $where .= " AND f.rating = :rating";
    $params[':rating'] = intval($rating);
}
if (($_GET['complaints_only'] ?? '') === '1') $where .= " AND f.is_complaint = 1";
$received = $_GET['received'] ?? '';
if (in_array($received, ['Yes', 'No'], true)) {
    $where .= " AND f.received = :received";
    $params[':received'] = $received;
}
$purok = trim($_GET['purok'] ?? '');
if ($purok !== '') {
    $where .= " AND h.purok = :purok";
    $params[':purok'] = $purok;
}
foreach (['date_from' => '>=', 'date_to' => '<='] as $key => $op) {
    $v = $_GET[$key] ?? '';
    if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $v)) {
        $where .= " AND DATE(f.created_at) $op :$key";
        $params[":$key"] = $v;
    }
}

$from = " FROM relief_feedback f
          JOIN households h ON h.household_id = f.household_id
          LEFT JOIN users u ON u.user_id = f.user_id";

$stmt = $conn->prepare(
    "SELECT f.*, h.head_of_family, h.purok, u.full_name AS submitted_by_name,
            CASE WHEN f.beneficiary_id IS NOT NULL THEN 'Scheduled distribution'
                 WHEN f.request_id IS NOT NULL THEN 'Relief request'
                 ELSE 'Direct allocation' END AS delivery_type,
            COALESCE(CONCAT('Beneficiary #', f.beneficiary_id), CONCAT('Request #', f.request_id), CONCAT('Allocation #', f.allocation_id)) AS delivery_ref"
    . $from . $where . " ORDER BY f.created_at DESC"
);
$stmt->execute($params);
$rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

$sum = $conn->prepare(
    "SELECT COUNT(*) AS total, ROUND(AVG(f.rating), 2) AS average_rating,
            SUM(f.received = 'Yes') AS received_yes, SUM(f.received = 'No') AS received_no,
            SUM(f.is_complaint) AS complaints,
            SUM(f.sufficiency = 'Sufficient') AS sufficient, SUM(f.sufficiency = 'Partially Sufficient') AS partially_sufficient,
            SUM(f.sufficiency = 'Insufficient') AS insufficient,
            SUM(f.experience = 'Excellent') AS excellent, SUM(f.experience = 'Good') AS good,
            SUM(f.experience = 'Fair') AS fair, SUM(f.experience = 'Poor') AS poor"
    . $from . $where
);
$sum->execute($params);
$summary = array_map(fn($v) => $v === null ? 0 : $v + 0, $sum->fetch(PDO::FETCH_ASSOC));

$dist = $conn->prepare("SELECT f.rating, COUNT(*) AS count" . $from . $where . " GROUP BY f.rating ORDER BY f.rating");
$dist->execute($params);
$by_rating = array_fill_keys([1, 2, 3, 4, 5], 0);
foreach ($dist->fetchAll(PDO::FETCH_ASSOC) as $d) $by_rating[intval($d['rating'])] = intval($d['count']);

echo json_encode(["success" => true, "data" => $rows, "summary" => $summary, "by_rating" => $by_rating]);

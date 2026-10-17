<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';

require_login(['admin']);

$database = new Database();
$conn = $database->connect();

$date_from = $_GET['date_from'] ?? '';
$date_to = $_GET['date_to'] ?? '';
$purok = $_GET['purok'] ?? '';

// Every released relief line: completed workflow allocations (released quantities, completion snapshot) and the
// historical Distributed rows of the old per-item allocations, labelled by source.
$lines = "(SELECT ra.allocation_id, ra.household_id, ra.item_id, ri.item_name, ri.unit, ri.category, COALESCE(ra.received_quantity, ra.quantity) AS quantity,
                  ra.distributed_at, ra.dss_score, ra.dss_category, ra.dss_rank, ra.dss_model_version, ra.distributed_by, 'Historical' AS source
           FROM relief_allocations ra JOIN relief_items ri ON ri.item_id = ra.item_id WHERE ra.status = 'Distributed'
           UNION ALL
           SELECT a.allocation_id, a.household_id, ai.item_id, ai.item_name, ai.unit, COALESCE(ri.category, '') AS category, ai.released_qty,
                  a.completed_at, a.completed_score, a.completed_priority, NULL, a.completed_rule_version, a.completed_by, 'Allocation workflow' AS source
           FROM household_allocations a JOIN household_allocation_items ai ON ai.allocation_id = a.allocation_id
           LEFT JOIN relief_items ri ON ri.item_id = ai.item_id WHERE a.status = 'COMPLETED' AND ai.released_qty > 0)";
$where = "WHERE 1=1";
$params = [];
if ($date_from !== '') { $where .= " AND DATE(ra.distributed_at) >= :date_from"; $params[':date_from'] = $date_from; }
if ($date_to !== '') { $where .= " AND DATE(ra.distributed_at) <= :date_to"; $params[':date_to'] = $date_to; }
if ($purok !== '') { $where .= " AND h.purok = :purok"; $params[':purok'] = $purok; }

$base_from = "FROM $lines ra JOIN households h ON ra.household_id = h.household_id";

$beneficiary_stmt = $conn->prepare("SELECT COUNT(DISTINCT ra.household_id) $base_from $where");
$beneficiary_stmt->execute($params);
$total_beneficiaries = intval($beneficiary_stmt->fetchColumn());

$items_stmt = $conn->prepare("SELECT COALESCE(SUM(ra.quantity),0) $base_from $where");
$items_stmt->execute($params);
$total_items = intval($items_stmt->fetchColumn());

$by_purok_stmt = $conn->prepare(
    "SELECT h.purok AS label, COUNT(DISTINCT ra.household_id) AS household_count, SUM(ra.quantity) AS item_count
     $base_from $where GROUP BY h.purok ORDER BY item_count DESC"
);
$by_purok_stmt->execute($params);
$by_purok = $by_purok_stmt->fetchAll(PDO::FETCH_ASSOC);

$by_item_stmt = $conn->prepare(
    "SELECT ra.item_name AS label, MAX(ra.category) AS category, SUM(ra.quantity) AS quantity
     $base_from $where GROUP BY ra.item_name ORDER BY quantity DESC"
);
$by_item_stmt->execute($params);
$by_item = $by_item_stmt->fetchAll(PDO::FETCH_ASSOC);

$by_month_stmt = $conn->prepare(
    "SELECT DATE_FORMAT(ra.distributed_at, '%Y-%m') AS label, SUM(ra.quantity) AS quantity, COUNT(DISTINCT ra.household_id) AS household_count
     $base_from $where GROUP BY label ORDER BY label ASC"
);
$by_month_stmt->execute($params);
$by_month = $by_month_stmt->fetchAll(PDO::FETCH_ASSOC);

$history_stmt = $conn->prepare(
    "SELECT ra.allocation_id, h.head_of_family, h.purok, ra.item_name, ra.unit, ra.quantity, ra.distributed_at,
            ra.dss_score, ra.dss_category, ra.dss_rank, ra.dss_model_version, ra.source, dp.full_name AS distributed_by_name
     $base_from LEFT JOIN users dp ON ra.distributed_by = dp.user_id
     $where ORDER BY ra.distributed_at DESC LIMIT 300"
);
$history_stmt->execute($params);
$history = $history_stmt->fetchAll(PDO::FETCH_ASSOC);

$puroks_stmt = $conn->query("SELECT DISTINCT purok FROM households ORDER BY purok ASC");
$puroks = $puroks_stmt->fetchAll(PDO::FETCH_COLUMN);

echo json_encode([
    "success" => true,
    "data" => [
        "total_beneficiaries" => $total_beneficiaries,
        "total_distributed_items" => $total_items,
        "distribution_by_purok" => $by_purok,
        "distribution_by_item" => $by_item,
        "distribution_by_month" => $by_month,
        "distribution_history" => $history,
        "available_puroks" => $puroks,
    ]
]);

<?php
/**
 * Inventory reconciliation (Phase 25) — Administrator and Relief Personnel, read-only.
 *
 * Per relief item, compares three independent records:
 *   1. the stock balance            relief_items.quantity
 *   2. the stock ledger             SUM(inventory_logs.quantity_change)
 *                                   (Stock In / Donation +, Stock Out -, Adjustment ±)
 *   3. the allocations              released in completed workflow allocations plus
 *                                   the historical Distributed per-item allocations;
 *                                   Ready plans are shown but reserve nothing
 * and flags any difference:
 *   - ledger_matches_stock          ledger balance = stock balance
 *   - distribution_matches_ledger   quantity received in Distributed allocations
 *                                   = Stock Out written by distributions
 *   - reserve_within_stock          reserved <= stock (never over-committed)
 * Items created before the ledger existed may legitimately show a ledger
 * difference; the report says so instead of hiding it.
 * Recommendations are never counted here: only real stock movements and
 * approved / distributed allocations.
 */
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';

require_login(['admin', 'relief_personnel']);

$conn = (new Database())->connect();
$p25 = (bool) $conn->query("SHOW COLUMNS FROM relief_allocations LIKE 'received_quantity'")->fetch();
$received_expr = $p25 ? "COALESCE(a.received_quantity, a.quantity)" : "a.quantity";

$items = $conn->query("SELECT item_id, item_name, category, unit, quantity FROM relief_items ORDER BY item_name")->fetchAll(PDO::FETCH_ASSOC);
$ledger = $conn->prepare(
    "SELECT COALESCE(SUM(quantity_change), 0) balance,
            COALESCE(SUM(CASE WHEN quantity_change > 0 AND log_type IN ('Stock In','Donation') THEN quantity_change ELSE 0 END), 0) received_in,
            COALESCE(SUM(CASE WHEN log_type = 'Stock Out' AND reference LIKE 'Relief distribution%' THEN -quantity_change WHEN log_type = 'Stock Out' AND allocation_ref IS NOT NULL THEN -quantity_change ELSE 0 END), 0) out_distribution,
            COALESCE(SUM(CASE WHEN log_type = 'Stock Out' AND (reference IS NULL OR reference NOT LIKE 'Relief distribution%') AND allocation_ref IS NULL THEN -quantity_change ELSE 0 END), 0) out_other,
            COALESCE(SUM(CASE WHEN log_type = 'Adjustment' THEN quantity_change ELSE 0 END), 0) adjustments,
            COUNT(*) entries
     FROM inventory_logs WHERE item_id = :id"
);
$workflow = $conn->prepare(
    "SELECT COALESCE(SUM(CASE WHEN a.status = 'READY_FOR_DISTRIBUTION' THEN ai.planned_qty ELSE 0 END), 0) ready,
            COALESCE(SUM(CASE WHEN a.status = 'COMPLETED' THEN COALESCE(ai.released_qty, 0) ELSE 0 END), 0) released,
            COALESCE(SUM(CASE WHEN a.status = 'COMPLETED' THEN ai.planned_qty ELSE 0 END), 0) planned_completed
     FROM household_allocation_items ai JOIN household_allocations a ON a.allocation_id = ai.allocation_id WHERE ai.item_id = :id"
);
$alloc = $conn->prepare(
    "SELECT 0 reserved,
            COALESCE(SUM(CASE WHEN a.status = 'Pending' THEN a.quantity ELSE 0 END), 0) pending,
            COALESCE(SUM(CASE WHEN a.status = 'Distributed' THEN $received_expr ELSE 0 END), 0) distributed_received,
            COALESCE(SUM(CASE WHEN a.status = 'Distributed' THEN a.quantity ELSE 0 END), 0) distributed_allocated,
            COALESCE(SUM(CASE WHEN a.status = 'Cancelled' THEN a.quantity ELSE 0 END), 0) cancelled,
            COUNT(CASE WHEN a.status = 'Cancelled' THEN 1 END) cancelled_count
     FROM relief_allocations a WHERE a.item_id = :id"
);

$rows = [];
$issues = 0;
foreach ($items as $it) {
    $ledger->execute([':id' => $it['item_id']]);
    $l = array_map('intval', $ledger->fetch(PDO::FETCH_ASSOC));
    $alloc->execute([':id' => $it['item_id']]);
    $a = array_map('intval', $alloc->fetch(PDO::FETCH_ASSOC));
    $workflow->execute([':id' => $it['item_id']]);
    $w = array_map('intval', $workflow->fetch(PDO::FETCH_ASSOC));
    $a['ready'] = $w['ready'];
    $a['distributed_received'] += $w['released'];
    $a['distributed_allocated'] += $w['planned_completed'];
    $stock = intval($it['quantity']);
    $checks = [
        'ledger_matches_stock' => $l['balance'] === $stock,
        'distribution_matches_ledger' => $a['distributed_received'] === $l['out_distribution'],
        'reserve_within_stock' => $a['reserved'] <= $stock,
        'stock_not_negative' => $stock >= 0,
    ];
    $notes = [];
    if (!$checks['ledger_matches_stock']) {
        $notes[] = $l['entries'] === 0
            ? "No ledger entries: the item was probably created before stock movements were logged."
            : "Ledger balance {$l['balance']} differs from stock {$stock} by " . ($stock - $l['balance']) . " {$it['unit']}.";
    }
    if (!$checks['distribution_matches_ledger']) $notes[] = "Received in distributions ({$a['distributed_received']}) differs from distribution Stock Out ({$l['out_distribution']}).";
    if (!$checks['reserve_within_stock']) $notes[] = "Reserved ({$a['reserved']}) exceeds stock ({$stock}).";
    $ok = !in_array(false, $checks, true);
    if (!$ok) $issues++;
    $rows[] = [
        'item_id' => intval($it['item_id']), 'item_name' => $it['item_name'], 'category' => $it['category'], 'unit' => $it['unit'],
        'stock' => $stock, 'ledger_balance' => $l['balance'], 'received_in' => $l['received_in'],
        'stock_out_distribution' => $l['out_distribution'], 'stock_out_other' => $l['out_other'], 'adjustments' => $l['adjustments'],
        'reserved' => $a['reserved'], 'ready' => $a['ready'], 'available' => max(0, $stock - $a['reserved']), 'pending_not_reserved' => $a['pending'],
        'distributed_received' => $a['distributed_received'], 'distributed_allocated' => $a['distributed_allocated'],
        'shortfall_from_partial_receipts' => $a['distributed_allocated'] - $a['distributed_received'],
        'cancelled' => $a['cancelled'], 'cancelled_count' => $a['cancelled_count'],
        'checks' => $checks, 'reconciled' => $ok, 'notes' => $notes,
    ];
}

echo json_encode([
    "success" => true,
    "generated_at" => date('Y-m-d H:i:s'),
    "items" => $rows,
    "summary" => ["items" => count($rows), "items_with_differences" => $issues],
    "method" => "Stock balance vs. stock ledger vs. distributions (completed allocations and historical Distributed rows). Nothing is reserved before distribution, so Available = stock; Ready shows planned quantities only.",
]);

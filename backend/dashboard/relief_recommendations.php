<?php
/**
 * DECISION SUPPORT — Relief Recommendation Engine (Phase 6, scarce-stock fix Phase 17).
 *
 * Rule-based and explainable (no AI/ML), matching the project's scope.
 *
 * 1. Households come from priority_list.php (Phase 22 weighted DSS). Every
 *    assessed household is considered (Phase 25; before, only Moderate+).
 *    They are processed in DSS rank order (score, then the DSS
 *    tie-break rules: severity, damage/needs, vulnerable members, household
 *    size, earlier report, lower household_id).
 * 2. For every relief item (including items with zero stock) a REQUESTED
 *    quantity is computed with the per-category ratios below.
 * 3. Each item has a stock pool:
 *        available = MAX(0, current stock - already committed)
 *    where "already committed" = SUM of relief_allocations still 'Approved'
 *    (approved but not yet distributed). 'Distributed' allocations are NOT
 *    subtracted again: distribute.php / delivery already reduced
 *    relief_items.quantity when they were handed out.
 * 4. Walking the households in priority order, each household receives
 *        recommended = MIN(requested, remaining pool)
 *    and the pool is reduced. Higher-priority households are therefore served
 *    first when stock is limited; the unmet part is reported as shortage and
 *    the household's need is never hidden.
 * 5. item_summary reports, per item: current_stock, already_committed,
 *    available, total_requested, total_recommended, shortage
 *    (= MAX(0, total_requested - available)) and remaining.
 *
 * Households that already have a Pending or Approved allocation for a given
 * item are skipped for that item (unchanged behaviour), so the same
 * recommendation doesn't keep resurfacing. A household/item pair that the
 * Administrator rejected (relief_recommendation_rejections, Phase 18) is also
 * skipped: it does not use up the stock pool or count as a shortage, and it is
 * returned separately in `rejected` so it can be restored.
 *
 * This endpoint only READS data; nothing is written or reserved by viewing it.
 *
 * Category ratios (all rounded up, i.e. ceil):
 *   Food      -> 1 unit per 2 household members
 *   Water     -> 3 units per household member
 *   Hygiene   -> 1 unit per household
 *   Shelter   -> 1 unit per 3 household members
 *   Medical   -> 1 unit only if the household has any vulnerable members
 *   (other)   -> 1 unit per household
 */

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../lib/dss.php';

require_login(['admin', 'relief_personnel']);

$database = new Database();
$conn = $database->connect();

// Reuse the same priority computation as priority_list.php by calling it
// internally would duplicate an HTTP round-trip, so instead we recompute here
// via a shared included function would be ideal — for simplicity and to avoid
// over-engineering a capstone project, we re-fetch the already-scored list
// through a lightweight internal include instead of duplicating the algorithm.
ob_start();
include __DIR__ . '/priority_list.php';
$priority_json = ob_get_clean();
$priority_response = json_decode($priority_json, true);
$priority_data = $priority_response['data'] ?? [];

// Phase 25 (audit F-ALLOC-02): EVERY eligible (assessed) household is considered,
// in DSS rank order; Low-priority households come last because their scores are
// lowest, so they receive only what is left after higher priorities. A low
// score never makes a household ineligible. Households that cannot be scored
// yet (Not Assessed) are listed separately as "assess first" — never hidden.
$priority_households = array_values(array_filter($priority_data, fn($h) => !empty($h['eligible'])));
$assess_first = array_values(array_map(fn($h) => [
    'household_id' => $h['household_id'], 'head_of_family' => $h['head_of_family'], 'purok' => $h['purok'],
    'number_of_members' => $h['number_of_members'], 'vulnerable_members' => $h['vulnerable_members'],
    'reason' => $h['explanation'] ?? 'No usable disaster report or assessment yet.',
], array_filter($priority_data, fn($h) => empty($h['eligible']))));

// Explicit processing order: the DSS rank (score, then the documented
// tie-break rules). Stock is handed out in exactly this order.
usort($priority_households, fn($a, $b) => $a['rank'] <=> $b['rank']);

// Phase 25 (audit F-ALLOC-04): sharing mode. 'full_need' (default, unchanged):
// each household in rank order gets its whole need before the next.
// 'minimum_share' (OPTIONAL, for review): first every household in rank order
// gets 1 unit, then remaining stock tops households up to their need in rank
// order. The total never exceeds available stock in either mode. The final
// sharing policy needs approval from barangay DRRM and social welfare staff.
$mode = (isset($_GET['mode']) && $_GET['mode'] === 'minimum_share') ? 'minimum_share' : 'full_need';

// All relief items — including zero-stock ones, so unmet needs show up as shortage.
$items = $conn->query("SELECT * FROM relief_items ORDER BY item_name ASC")->fetchAll(PDO::FETCH_ASSOC);

// Quantity already committed per item: approved but not yet distributed.
$committed_by_item = [];
foreach ($conn->query(
    "SELECT item_id, COALESCE(SUM(quantity), 0) AS committed
     FROM relief_allocations WHERE status = 'Approved' GROUP BY item_id"
)->fetchAll(PDO::FETCH_ASSOC) as $row) {
    $committed_by_item[$row['item_id']] = intval($row['committed']);
}

// Per-item stock pool and running totals (all computed here, server-side).
$item_summary = [];
foreach ($items as $item) {
    $current = max(0, intval($item['quantity']));
    $committed = $committed_by_item[$item['item_id']] ?? 0;
    $available = max(0, $current - $committed);
    $item_summary[$item['item_id']] = [
        'item_id' => intval($item['item_id']),
        'item_name' => $item['item_name'],
        'category' => $item['category'],
        'unit' => $item['unit'],
        'current_stock' => $current,
        'already_committed' => $committed,
        'available' => $available,
        'total_requested' => 0,
        'total_recommended' => 0,
        'shortage' => 0,
        'remaining' => $available, // working pool, reduced as households are served
        'households_requesting' => 0,
        'households_short' => 0,
    ];
}

// Category ratios: lib/dss.php (Phase 19 — same rules, one shared definition).

$existing_stmt = $conn->prepare(
    "SELECT item_id FROM relief_allocations WHERE household_id = :household_id AND status IN ('Pending','Approved')"
);

// Administrator-rejected recommendations (household_id-item_id pairs). If the
// Phase 18 table has not been created yet, behave exactly as before (none).
$rejected_pairs = [];
$rejected_list = [];
try {
    $rej_rows = $conn->query(
        "SELECT r.household_id, r.item_id, r.reason, r.rejected_at,
                h.head_of_family, h.purok, i.item_name, u.full_name AS rejected_by_name
         FROM relief_recommendation_rejections r
         JOIN households h ON h.household_id = r.household_id
         JOIN relief_items i ON i.item_id = r.item_id
         LEFT JOIN users u ON u.user_id = r.rejected_by
         ORDER BY r.rejected_at DESC"
    )->fetchAll(PDO::FETCH_ASSOC);
    foreach ($rej_rows as $row) {
        $rejected_pairs[$row['household_id'] . '-' . $row['item_id']] = true;
        $rejected_list[] = $row;
    }
} catch (PDOException $e) {
    error_log("relief_recommendations.php: rejection table unavailable: " . $e->getMessage());
}

/** One pass of the engine in the given mode; returns [recommendations, item_summary]. */
$run = function (string $mode) use ($priority_households, $items, $item_summary, $existing_stmt, $rejected_pairs) {
    $pools = $item_summary;
    $rows = [];   // per household: list of [item, requested, reason]
    foreach ($priority_households as $h) {
        $household_id = $h['household_id'];
        $members = max(1, intval($h['number_of_members']));
        $vulnerable = intval($h['vulnerable_members']);
        $existing_stmt->execute([':household_id' => $household_id]);
        $already = $existing_stmt->fetchAll(PDO::FETCH_COLUMN);
        $needs = [];
        foreach ($items as $item) {
            if (in_array($item['item_id'], $already)) continue;                         // active allocation exists
            if (isset($rejected_pairs[$household_id . '-' . $item['item_id']])) continue; // rejected by the Administrator
            [$requested_qty, $reason] = dss_estimate_need((string) $item['category'], $members, $vulnerable);
            if ($requested_qty <= 0) continue;
            $needs[$item['item_id']] = ['item' => $item, 'requested' => $requested_qty, 'reason' => $reason, 'given' => 0, 'pool_before' => null];
        }
        $rows[] = ['h' => $h, 'needs' => $needs];
    }
    // Pass 1: minimum share (1 unit each) — only in minimum_share mode.
    if ($mode === 'minimum_share') {
        foreach ($rows as &$r) {
            foreach ($r['needs'] as $iid => &$n) {
                $n['pool_before'] = $pools[$iid]['remaining'];
                $take = min(1, $n['requested'], $pools[$iid]['remaining']);
                $n['given'] += $take;
                $pools[$iid]['remaining'] -= $take;
            }
            unset($n);
        }
        unset($r);
    }
    // Pass 2 (both modes): fill each household's remaining need in rank order.
    foreach ($rows as &$r) {
        foreach ($r['needs'] as $iid => &$n) {
            if ($n['pool_before'] === null) $n['pool_before'] = $pools[$iid]['remaining'];
            $take = min($n['requested'] - $n['given'], $pools[$iid]['remaining']);
            $n['given'] += $take;
            $pools[$iid]['remaining'] -= $take;
        }
        unset($n);
    }
    unset($r);

    $recommendations = [];
    foreach ($rows as $r) {
        $h = $r['h'];
        $item_recommendations = [];
        foreach ($r['needs'] as $iid => $n) {
            $item = $n['item'];
            $requested_qty = $n['requested'];
            $allocatable_qty = $n['given'];
            $shortage_qty = $requested_qty - $allocatable_qty;
            $pool = &$pools[$iid];
            $pool['total_requested'] += $requested_qty;
            $pool['total_recommended'] += $allocatable_qty;
            $pool['households_requesting']++;
            if ($shortage_qty > 0) $pool['households_short']++;
            if ($allocatable_qty > 0) $pool['households_reached'] = ($pool['households_reached'] ?? 0) + 1;
            if ($shortage_qty === 0) $pool['households_fully_covered'] = ($pool['households_fully_covered'] ?? 0) + 1;
            unset($pool);
            $unit = $item['unit'];
            $reason = $n['reason'];
            if ($allocatable_qty === 0) {
                $reason .= " — no stock available after serving higher-priority households ($requested_qty $unit not covered)";
            } elseif ($shortage_qty > 0) {
                $reason .= " — only $allocatable_qty of $requested_qty $unit available after serving higher-priority households ($shortage_qty $unit not covered)";
            }
            if ($mode === 'minimum_share' && $allocatable_qty > 0) $reason .= " [minimum-share-first mode]";
            $item_recommendations[] = [
                'item_id' => $item['item_id'],
                'item_name' => $item['item_name'],
                'category' => $item['category'],
                'unit' => $unit,
                'available_stock' => intval($n['pool_before']),
                'requested_quantity' => intval($requested_qty),
                'recommended_quantity' => intval($requested_qty),    // kept for backward compatibility (= requested)
                'quantity_to_allocate' => intval($allocatable_qty),  // what the system recommends allocating now
                'shortage' => intval($shortage_qty),
                'reason' => $reason,
            ];
        }
        if (!empty($item_recommendations)) {
            $recommendations[] = [
                'household_id' => $h['household_id'],
                'head_of_family' => $h['head_of_family'],
                'purok' => $h['purok'],
                'priority_level' => $h['priority_level'],
                'priority_score' => $h['priority_score'],
                'rank' => $h['rank'],
                'needs_review' => $h['needs_review'],
                'number_of_members' => $h['number_of_members'],
                'vulnerable_members' => $h['vulnerable_members'],
                'total_shortage' => array_sum(array_column($item_recommendations, 'shortage')),
                'recommendations' => $item_recommendations,
            ];
        }
    }
    foreach ($pools as &$sum) {
        $sum['shortage'] = max(0, $sum['total_requested'] - $sum['available']);
        $sum['households_reached'] = $sum['households_reached'] ?? 0;
        $sum['households_fully_covered'] = $sum['households_fully_covered'] ?? 0;
    }
    unset($sum);
    return [$recommendations, $pools];
};

[$recommendations, $item_summary_out] = $run($mode);
// Coverage preview of both modes, so officials can compare before approving anything.
$coverage_preview = [];
foreach (['full_need', 'minimum_share'] as $m) {
    [, $pools_m] = $m === $mode ? [null, $item_summary_out] : $run($m);
    foreach ($pools_m as $sum) {
        $coverage_preview[$m][] = [
            'item_id' => $sum['item_id'], 'item_name' => $sum['item_name'], 'unit' => $sum['unit'],
            'available' => $sum['available'], 'total_recommended' => $sum['total_recommended'],
            'households_requesting' => $sum['households_requesting'],
            'households_reached' => $sum['households_reached'], 'households_fully_covered' => $sum['households_fully_covered'],
            'households_unserved' => $sum['households_requesting'] - $sum['households_reached'],
        ];
    }
}

echo json_encode([
    "success" => true,
    "mode" => $mode,
    "data" => $recommendations,               // unchanged shape: households with their item rows
    "item_summary" => array_values($item_summary_out),
    "coverage_preview" => $coverage_preview,  // Phase 25: both sharing modes, for comparison only
    "assess_first" => $assess_first,          // Phase 25: Not Assessed households, visible for assessment / urgent review
    "policy_note" => "Default mode is Full need (unchanged). Minimum share first is an optional mode for review; the sharing policy must be approved by the barangay DRRM and social welfare officers.",
    "rejected" => $rejected_list,               // Administrator-rejected recommendations (restorable)
]);

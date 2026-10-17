<?php
/**
 * Decision Support — needs estimation rule (Phase 19 extraction).
 *
 * The per-category ratios below are the EXISTING rules from
 * dashboard/relief_recommendations.php (Phase 6), moved here unchanged so
 * that the recommendation engine and the relief-request review screen use one
 * definition. They estimate how much of an item a household needs; they do
 * not change the priority score.
 *
 *   Food      -> 1 unit per 2 household members (rounded up)
 *   Water     -> 3 units per household member
 *   Hygiene   -> 1 unit per household
 *   Shelter   -> 1 unit per 3 household members (rounded up)
 *   Medical   -> 1 unit only if the household has any vulnerable members
 *   (other)   -> 1 unit per household
 */

const DSS_CATEGORY_RATIO = [
    'Food' => ['per' => 2, 'basis' => 'members', 'reason' => 'Food: 1 unit per 2 household members'],
    'Water' => ['per' => 1, 'multiplier' => 3, 'basis' => 'members', 'reason' => '3 units per household member'],
    'Hygiene' => ['per' => 1, 'basis' => 'household', 'reason' => '1 unit per household'],
    'Shelter' => ['per' => 3, 'basis' => 'members', 'reason' => '1 unit per 3 household members'],
    'Medical' => ['basis' => 'vulnerable', 'reason' => 'Medical: 1 unit because the household has Vulnerable Members'],
];
const DSS_DEFAULT_RATIO = ['basis' => 'household', 'reason' => '1 unit per household (standard rule for other items)'];

/**
 * @return array [int $quantity, string $reason]  quantity 0 = no need under the rule
 */
function dss_estimate_need(string $category, int $members, int $vulnerable): array
{
    $members = max(1, $members);
    $rule = DSS_CATEGORY_RATIO[$category] ?? DSS_DEFAULT_RATIO;
    $qty = 0;
    if ($rule['basis'] === 'members') {
        $per = $rule['per'] ?? 1;
        $multiplier = $rule['multiplier'] ?? 1;
        $qty = intval(ceil($members / $per) * $multiplier);
    } elseif ($rule['basis'] === 'household') {
        $qty = 1;
    } elseif ($rule['basis'] === 'vulnerable') {
        $qty = $vulnerable > 0 ? 1 : 0;
    }
    return [$qty, $rule['reason']];
}

require_once __DIR__ . '/automatic_priority.php';

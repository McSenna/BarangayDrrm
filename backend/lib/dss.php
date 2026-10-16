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

/* =====================================================================
 * PRIORITY SCORING — weighted five-criterion model (Phase 22)
 *
 * Replaces the Phase 6 seven-factor point score (0-20). Rule-based and
 * explainable: no AI, no machine learning, no randomness. Weights and rating
 * rules are PROVISIONAL until reviewed with the research adviser and BDRRMC.
 * They are fixed in code (there is intentionally no configuration screen).
 *
 * Each criterion is rated 1-5 (higher = greater relief urgency):
 *   Weighted contribution = (rating / 5) x weight
 *   Priority score        = sum of the five contributions   (scale 0-100;
 *                           lowest attainable 20 because the lowest rating is 1)
 *
 * Because every weight is a multiple of 5, each contribution is a whole number:
 *   score = 6*S + 5*D + 4*V + 3*H + 2*C
 * ===================================================================== */

/** Phase 25: model identifier stored with every allocation's DSS snapshot. */
const DSS_MODEL_VERSION = 'weighted-v1 (S30 D25 V20 H15 C10; Critical>=80 High>=60 Moderate>=40)';

const DSS_WEIGHTS = [
    'disaster_severity'       => 30,
    'damage_unmet_needs'      => 25,
    'vulnerable_members'      => 20,
    'household_size'          => 15,
    'assessment_confidence'   => 10,
];

const DSS_CRITERIA_LABELS = [
    'disaster_severity'     => 'Disaster Severity',
    'damage_unmet_needs'    => 'Verified Damage and Unmet Essential Needs',
    'vulnerable_members'    => 'Vulnerable Household Members',
    'household_size'        => 'Household Size',
    'assessment_confidence' => 'Assessment Completeness and Verification Confidence',
];

/** Priority categories (provisional): equal 20-point bands above the minimum attainable score of 20. */
const DSS_CATEGORIES = [
    ['min' => 80, 'level' => 'Critical Priority'],
    ['min' => 60, 'level' => 'High Priority'],
    ['min' => 40, 'level' => 'Moderate Priority'],
    ['min' => 0,  'level' => 'Low Priority'],
];
const DSS_NOT_ASSESSED = 'Not Assessed';

/** Essential relief categories whose coverage measures "unmet essential needs". */
const DSS_ESSENTIAL_CATEGORIES = ['Food', 'Water', 'Hygiene', 'Shelter', 'Medical'];

/** Rating used for a criterion that cannot be rated yet (missing assessment): the midpoint, never the lowest. */
const DSS_PROVISIONAL_RATING = 3;

/**
 * 1. Disaster Severity — reported impact severity of the household's selected report,
 *    raised one level while an active hazard alert covers the household's purok
 *    (or the whole barangay), capped at 5.
 *      Low = 1, Medium = 2, High = 3, Critical = 4; +1 active hazard alert.
 */
function dss_rate_severity(?string $severity, bool $active_hazard): ?int
{
    $base = ['Low' => 1, 'Medium' => 2, 'High' => 3, 'Critical' => 4][$severity ?? ''] ?? null;
    if ($base === null) return null;
    return min(5, $base + ($active_hazard ? 1 : 0));
}

/**
 * 2a. Damage level from the field damage assessment (house, infrastructure,
 *     property, agricultural). null = not assessed.
 *      5 = house Totally Damaged
 *      4 = house Major damage, or another category Totally Damaged
 *      3 = Major damage in a category other than the house
 *      2 = Minor damage only
 *      1 = no damage recorded
 */
function dss_damage_level(?array $a): ?int
{
    if (!$a) return null;
    $house = $a['house_damage'] ?? 'None';
    $others = [$a['infrastructure_damage'] ?? 'None', $a['property_damage'] ?? 'None', $a['agricultural_damage'] ?? 'None'];
    if ($house === 'Totally Damaged') return 5;
    if ($house === 'Major' || in_array('Totally Damaged', $others, true)) return 4;
    if (in_array('Major', $others, true)) return 3;
    if ($house === 'Minor' || in_array('Minor', $others, true)) return 2;
    return 1;
}

/**
 * 2b. Needs-coverage adjustment: relief already allocated (Approved) or
 *     distributed since the report reduces the unmet need.
 *      coverage 100%      -> -2 (essential needs met)
 *      coverage 50-99%    -> -1 (partly met)
 *      coverage below 50% ->  0
 */
function dss_needs_adjustment(float $coverage): int
{
    if ($coverage >= 0.999) return 2;
    if ($coverage >= 0.5) return 1;
    return 0;
}

/** 2. Verified Damage and Unmet Essential Needs = damage level - coverage adjustment (minimum 1). */
function dss_rate_damage_needs(?int $damage_level, float $coverage): array
{
    $provisional = $damage_level === null;
    $level = $provisional ? DSS_PROVISIONAL_RATING : $damage_level;
    return [max(1, $level - dss_needs_adjustment($coverage)), $provisional];
}

/** 3. Vulnerable members (children incl. infants, seniors, PWD, pregnant, medical needs, other): 0->1, 1->2, 2->3, 3->4, 4+->5. */
function dss_rate_vulnerable(int $count): int
{
    return min(5, max(0, $count) + 1);
}

/** 4. Household size: 1->1, 2-3->2, 4-5->3, 6-7->4, 8+->5. */
function dss_rate_size(int $members): int
{
    if ($members >= 8) return 5;
    if ($members >= 6) return 4;
    if ($members >= 4) return 3;
    if ($members >= 2) return 2;
    return 1;
}

/**
 * 5. Assessment completeness and verification confidence:
 *      5 = verified report + damage assessment + complete household profile
 *      4 = verified report + damage assessment, household profile incomplete
 *      3 = verified report, no damage assessment yet
 *      2 = report not yet verified, damage assessment recorded
 *      1 = report not yet verified, no damage assessment
 */
function dss_rate_confidence(bool $verified, bool $assessed, bool $profile_complete): int
{
    if ($verified && $assessed) return $profile_complete ? 5 : 4;
    if ($verified) return 3;
    return $assessed ? 2 : 1;
}

/** Weighted contribution of one criterion: (rating / 5) x weight. */
function dss_contribution(string $criterion, int $rating): float
{
    return round($rating / 5 * DSS_WEIGHTS[$criterion], 2);
}

/** Total score from the five ratings (keys = DSS_WEIGHTS keys). */
function dss_weighted_score(array $ratings): float
{
    $total = 0.0;
    foreach (DSS_WEIGHTS as $k => $w) {
        $total += dss_contribution($k, intval($ratings[$k]));
    }
    return round($total, 2);
}

function dss_priority_category(float $score): string
{
    foreach (DSS_CATEGORIES as $c) {
        if ($score >= $c['min']) return $c['level'];
    }
    return 'Low Priority';
}

/**
 * Coverage of the household's essential needs by relief allocated (Approved) or
 * distributed on/after $since. Per essential category: min(1, received / need),
 * need from dss_estimate_need(); coverage = average over categories with a need.
 * Only categories that exist in the relief inventory are counted.
 *
 * @return array ['coverage' => float 0..1, 'categories' => [[category, need, received, percent]]]
 */
function dss_needs_coverage(int $members, int $vulnerable, array $received_by_category, array $inventory_categories): array
{
    $rows = [];
    $sum = 0.0;
    $n = 0;
    foreach (DSS_ESSENTIAL_CATEGORIES as $cat) {
        if (!in_array($cat, $inventory_categories, true)) continue;
        [$need] = dss_estimate_need($cat, $members, $vulnerable);
        if ($need <= 0) continue;
        $got = intval($received_by_category[$cat] ?? 0);
        $ratio = min(1.0, $got / $need);
        $rows[] = ['category' => $cat, 'need' => $need, 'received' => $got, 'percent' => intval(round($ratio * 100))];
        $sum += $ratio;
        $n++;
    }
    return ['coverage' => $n ? $sum / $n : 0.0, 'categories' => $rows];
}

/**
 * Compute the priority of every household from the database (single source of
 * truth for the Priority Assessment, recommendations, request review, map, etc.).
 *
 * Eligible = the household has at least one disaster report that is not
 * Rejected. The selected report is the highest-severity VERIFIED report; if none
 * is verified yet, the highest-severity Pending report (flagged for review).
 * Households without a usable report are returned with eligible = false,
 * priority_score = null and priority_level = 'Not Assessed' (never "lowest").
 *
 * Ranking: score (desc), then severity rating, damage/needs rating, vulnerable
 * rating, household-size rating (all desc), then the earlier report date, then
 * the lower household_id.
 */
/**
 * Phase 25: the same computation, done once per request. Endpoints that
 * include the priority list AND store a snapshot (approve_recommendation)
 * therefore record exactly the figures the official was shown.
 */
function dss_compute_priorities_cached(PDO $conn, bool $refresh = false): array
{
    static $cache = null;
    if ($cache === null || $refresh) $cache = dss_compute_priorities($conn);
    return $cache;
}

function dss_compute_priorities(PDO $conn): array
{
    require_once __DIR__ . '/puroks.php';
    $calculated_at = date('Y-m-d H:i:s');

    $households = $conn->query("SELECT * FROM households")->fetchAll(PDO::FETCH_ASSOC);

    $purok_alert = [];
    $barangay_alert = false;
    foreach ($conn->query("SELECT affected_purok FROM hazard_alerts WHERE is_active = 1")->fetchAll(PDO::FETCH_COLUMN) as $p) {
        if ($p === null || trim($p) === '') $barangay_alert = true;
        else $purok_alert[purok_match_key($p)] = true;
    }

    $inventory_categories = $conn->query("SELECT DISTINCT category FROM relief_items")->fetchAll(PDO::FETCH_COLUMN);

    $report_stmt = $conn->prepare(
        "SELECT report_id, severity, status, report_date, disaster_type, created_at FROM disaster_reports
         WHERE household_id = :h AND status <> 'Rejected'
         ORDER BY (status = 'Verified') DESC, FIELD(severity, 'Critical','High','Medium','Low') ASC, report_date DESC, report_id DESC
         LIMIT 1"
    );
    $assess_stmt = $conn->prepare("SELECT * FROM damage_assessments WHERE report_id = :r");
    $members_stmt = $conn->prepare("SELECT COUNT(*) FROM household_members WHERE household_id = :h");
    // Phase 25: a Distributed allocation counts the quantity actually received (partial receipt).
    $has_received = (bool) $conn->query("SHOW COLUMNS FROM relief_allocations LIKE 'received_quantity'")->fetch();
    $qty_expr = $has_received ? "CASE WHEN a.status = 'Distributed' THEN COALESCE(a.received_quantity, a.quantity) ELSE a.quantity END" : "a.quantity";
    $received_stmt = $conn->prepare(
        "SELECT i.category, COALESCE(SUM($qty_expr), 0) AS qty
         FROM relief_allocations a JOIN relief_items i ON i.item_id = a.item_id
         WHERE a.household_id = :h AND a.status IN ('Approved', 'Distributed') AND a.allocation_date >= :since
         GROUP BY i.category"
    );
    $any_alloc_stmt = $conn->prepare("SELECT status FROM relief_allocations WHERE household_id = :h");

    $rows = [];
    foreach ($households as $h) {
        $hid = intval($h['household_id']);
        $members = max(0, intval($h['number_of_members']));
        $vuln = min(max(0, intval($h['vulnerable_members'])), max(1, $members));

        $vuln_total = intval($h['children_count']) + intval($h['seniors_count']) + intval($h['pwd_count']) +
            intval($h['pregnant_count']) + intval($h['medical_needs_count']) + intval($h['other_vulnerable_count']) +
            min(2, intdiv($members, 5));
        $vuln_level = $vuln_total >= 7 ? 'Critical' : ($vuln_total >= 4 ? 'High' : ($vuln_total >= 2 ? 'Medium' : 'Low'));

        $report_stmt->execute([':h' => $hid]);
        $report = $report_stmt->fetch(PDO::FETCH_ASSOC) ?: null;

        $any_alloc_stmt->execute([':h' => $hid]);
        $alloc_statuses = $any_alloc_stmt->fetchAll(PDO::FETCH_COLUMN);
        $relief_status = in_array('Distributed', $alloc_statuses, true) ? 'Distributed'
            : (array_intersect(['Pending', 'Approved'], $alloc_statuses) ? 'Pending/Approved' : 'None');

        $base = [
            'household_id' => $hid,
            'head_of_family' => $h['head_of_family'],
            'purok' => $h['purok'],
            'number_of_members' => $members,
            'vulnerable_members' => intval($h['vulnerable_members']),
            'vulnerability_score' => $vuln_total,
            'vulnerability_level' => $vuln_level,
            'current_relief_status' => $relief_status,
            'calculated_at' => $calculated_at,
        ];

        if (!$report) {
            $rows[] = $base + [
                'eligible' => false,
                'rank' => null,
                'priority_score' => null,
                'priority_level' => DSS_NOT_ASSESSED,
                'report_id' => null,
                'latest_severity' => 'No report',
                'latest_report_status' => 'No report',
                'assessment_status' => 'No disaster report recorded',
                'has_damage_assessment' => false,
                'needs_review' => true,
                'review_reasons' => ['No disaster report has been recorded for this household, so it cannot be scored yet.'],
                'criteria' => [],
                'score_breakdown' => [],
                'ratings' => [],
                'damage' => null,
                'unmet_needs' => null,
                'explanation' => 'Not assessed: record and verify a disaster report and damage assessment to calculate a priority.',
                'provisional' => true,
            ];
            continue;
        }

        $verified = $report['status'] === 'Verified';
        $assess_stmt->execute([':r' => $report['report_id']]);
        $assessment = $assess_stmt->fetch(PDO::FETCH_ASSOC) ?: null;

        $members_stmt->execute([':h' => $hid]);
        $member_rows = intval($members_stmt->fetchColumn());
        $has_coords = $h['latitude'] !== null && $h['longitude'] !== null && $h['latitude'] !== '' && $h['longitude'] !== '';
        $profile_gaps = [];
        if ($members < 1) $profile_gaps[] = 'number of members not recorded';
        if (!$has_coords) $profile_gaps[] = 'no map coordinates';
        if ($member_rows !== $members) $profile_gaps[] = "member list has $member_rows of $members members";
        $profile_complete = !$profile_gaps;

        $active_hazard = (!empty($h['purok']) && isset($purok_alert[purok_match_key($h['purok'])])) || $barangay_alert;

        $received_stmt->execute([':h' => $hid, ':since' => $report['report_date']]);
        $received = [];
        foreach ($received_stmt->fetchAll(PDO::FETCH_ASSOC) as $r) $received[$r['category']] = intval($r['qty']);
        $needs = dss_needs_coverage(max(1, $members), $vuln, $received, $inventory_categories);

        $damage_level = dss_damage_level($assessment);
        [$rating_dn, $dn_provisional] = dss_rate_damage_needs($damage_level, $needs['coverage']);

        $ratings = [
            'disaster_severity' => dss_rate_severity($report['severity'], $active_hazard) ?? DSS_PROVISIONAL_RATING,
            'damage_unmet_needs' => $rating_dn,
            'vulnerable_members' => dss_rate_vulnerable($vuln),
            'household_size' => dss_rate_size($members),
            'assessment_confidence' => dss_rate_confidence($verified, (bool) $assessment, $profile_complete),
        ];
        $score = dss_weighted_score($ratings);
        $score_out = (fmod($score, 1.0) == 0.0) ? intval($score) : $score;

        $cov_pct = intval(round($needs['coverage'] * 100));
        $adj = dss_needs_adjustment($needs['coverage']);
        $damage_text = $assessment
            ? "house {$assessment['house_damage']}, infrastructure {$assessment['infrastructure_damage']}, property {$assessment['property_damage']}, agricultural {$assessment['agricultural_damage']}"
            : 'no damage assessment yet';
        $basis = [
            'disaster_severity' => "{$report['severity']} {$report['disaster_type']} report (" . ($verified ? 'verified' : 'not yet verified') . ")"
                . ($active_hazard ? '; +1 active hazard alert for ' . (isset($purok_alert[purok_match_key((string) $h['purok'])]) ? $h['purok'] : 'the barangay') : ''),
            'damage_unmet_needs' => ($assessment ? "Damage level $damage_level ($damage_text)" : "Damage not assessed: provisional level " . DSS_PROVISIONAL_RATING)
                . "; essential needs covered $cov_pct%" . ($adj ? " (-$adj)" : ''),
            'vulnerable_members' => "$vuln vulnerable member(s)",
            'household_size' => "$members member(s)",
            'assessment_confidence' => ($verified ? 'Verified report' : 'Report pending verification') . ', '
                . ($assessment ? 'damage assessed' : 'no damage assessment') . ', '
                . ($profile_complete ? 'household profile complete' : 'household profile incomplete'),
        ];
        $criteria = [];
        $breakdown = [];
        foreach (DSS_WEIGHTS as $k => $w) {
            $c = dss_contribution($k, $ratings[$k]);
            $breakdown[$k] = (fmod($c, 1.0) == 0.0) ? intval($c) : $c;
            $criteria[] = [
                'key' => $k, 'label' => DSS_CRITERIA_LABELS[$k], 'weight' => $w, 'rating' => $ratings[$k],
                'contribution' => $breakdown[$k], 'basis' => $basis[$k],
                'provisional' => $k === 'damage_unmet_needs' && $dn_provisional,
            ];
        }

        $reasons = [];
        if (!$verified) $reasons[] = 'Disaster report is not yet verified by the Administrator.';
        if (!$assessment) $reasons[] = 'No damage assessment yet; damage is rated provisionally at ' . DSS_PROVISIONAL_RATING . ' (midpoint), not at the lowest level.';
        if (!$profile_complete) $reasons[] = 'Household profile incomplete: ' . implode('; ', $profile_gaps) . '.';

        $assessment_status = ($verified ? 'Verified' : 'Pending verification') . ' · ' . ($assessment ? 'Assessed' : 'Not assessed');

        $explanation = "{$report['severity']} {$report['disaster_type']}" . ($active_hazard ? ' with an active hazard alert' : '')
            . '; ' . ($assessment ? dss_damage_phrase($assessment) : 'damage not yet assessed')
            . "; $cov_pct% of essential needs covered; $vuln vulnerable of $members member(s)"
            . ($reasons ? '. Needs manual review.' : '.');

        $rows[] = $base + [
            'eligible' => true,
            'rank' => null,
            'priority_score' => $score_out,
            'priority_level' => dss_priority_category($score),
            'report_id' => intval($report['report_id']),
            'report_date' => $report['report_date'],
            'disaster_type' => $report['disaster_type'],
            'latest_severity' => $report['severity'],
            'latest_report_status' => $report['status'],
            'assessment_status' => $assessment_status,
            'has_damage_assessment' => (bool) $assessment,
            'needs_review' => (bool) $reasons,
            'review_reasons' => $reasons,
            'ratings' => $ratings,
            'criteria' => $criteria,
            'score_breakdown' => $breakdown,
            'damage' => $assessment ? [
                'house' => $assessment['house_damage'], 'infrastructure' => $assessment['infrastructure_damage'],
                'property' => $assessment['property_damage'], 'agricultural' => $assessment['agricultural_damage'],
                'level' => $damage_level,
            ] : null,
            'unmet_needs' => ['coverage_percent' => $cov_pct, 'categories' => $needs['categories']],
            'explanation' => $explanation,
            'provisional' => $dn_provisional,
        ];
    }

    // Rank eligible households; not-assessed households follow, unranked.
    $eligible = array_values(array_filter($rows, fn($r) => $r['eligible']));
    $others = array_values(array_filter($rows, fn($r) => !$r['eligible']));
    usort($eligible, function ($a, $b) {
        $c = $b['priority_score'] <=> $a['priority_score'];
        if ($c) return $c;
        foreach (['disaster_severity', 'damage_unmet_needs', 'vulnerable_members', 'household_size'] as $k) {
            $c = $b['ratings'][$k] <=> $a['ratings'][$k];
            if ($c) return $c;
        }
        $c = strcmp((string) $a['report_date'], (string) $b['report_date']);
        if ($c) return $c;
        return $a['household_id'] <=> $b['household_id'];
    });
    foreach ($eligible as $i => &$r) $r['rank'] = $i + 1;
    unset($r);
    usort($others, fn($a, $b) => $a['household_id'] <=> $b['household_id']);
    return array_merge($eligible, $others);
}

function dss_damage_label(?int $level): string
{
    return [1 => 'No damage recorded', 2 => 'Minor damage only', 3 => 'Major damage (not the house)',
        4 => 'Major house damage or a category totally damaged', 5 => 'House totally damaged'][$level] ?? 'Not assessed';
}

/** "damage: house Major, property Major" — only the damaged categories, or "no damage recorded". */
function dss_damage_phrase(array $a): string
{
    $parts = [];
    foreach (['house' => 'house_damage', 'infrastructure' => 'infrastructure_damage', 'property' => 'property_damage', 'agricultural' => 'agricultural_damage'] as $label => $k) {
        if (($a[$k] ?? 'None') !== 'None') $parts[] = "$label {$a[$k]}";
    }
    return $parts ? 'damage: ' . implode(', ', $parts) : 'no damage recorded';
}

/** Method summary returned with the priority list (for the "how is this calculated" note). */
function dss_method_summary(): array
{
    return [
        'model' => 'Weighted scoring: contribution = (rating / 5) x weight; score = sum (0-100 scale)',
        'weights' => DSS_WEIGHTS,
        'categories' => DSS_CATEGORIES,
        'provisional' => true,
    ];
}

<?php
/**
 * Phase 22 — unit test of the weighted DSS rating rules and formula (no database).
 * Every expected value below was calculated by hand from the documented rules
 * (docs/DSS_CRITERIA_MATRIX_RESEARCH_PAPER.md) and must match backend/lib/dss.php.
 *
 *   php tests/dss_weighted_unit_test.php
 */
require __DIR__ . '/../backend/lib/dss.php';

$pass = 0; $fail = 0;
function check($name, $cond, $detail = '') {
    global $pass, $fail;
    if ($cond) { $pass++; echo "PASS $name\n"; } else { $fail++; echo "FAIL $name  -> " . json_encode($detail) . "\n"; }
}

// ---- weights
check('weights total exactly 100%', array_sum(DSS_WEIGHTS) === 100, DSS_WEIGHTS);
check('five criteria with the provisional weights 30/25/20/15/10',
    DSS_WEIGHTS === ['disaster_severity' => 30, 'damage_unmet_needs' => 25, 'vulnerable_members' => 20, 'household_size' => 15, 'assessment_confidence' => 10]);

// ---- rating rules
check('severity: Low 1, Medium 2, High 3, Critical 4',
    [dss_rate_severity('Low', false), dss_rate_severity('Medium', false), dss_rate_severity('High', false), dss_rate_severity('Critical', false)] === [1, 2, 3, 4]);
check('severity: +1 with an active hazard alert, capped at 5',
    [dss_rate_severity('Low', true), dss_rate_severity('High', true), dss_rate_severity('Critical', true)] === [2, 4, 5]);
check('severity: unknown value is not rated (null)', dss_rate_severity('Extreme', false) === null);

$A = fn($h, $i = 'None', $p = 'None', $g = 'None') => ['house_damage' => $h, 'infrastructure_damage' => $i, 'property_damage' => $p, 'agricultural_damage' => $g];
check('damage level 5: house Totally Damaged', dss_damage_level($A('Totally Damaged')) === 5);
check('damage level 4: house Major', dss_damage_level($A('Major')) === 4);
check('damage level 4: another category Totally Damaged', dss_damage_level($A('Minor', 'None', 'Totally Damaged')) === 4);
check('damage level 3: Major outside the house', dss_damage_level($A('Minor', 'None', 'Major')) === 3);
check('damage level 2: Minor only', dss_damage_level($A('None', 'Minor')) === 2);
check('damage level 1: no damage', dss_damage_level($A('None')) === 1);
check('damage level null: not assessed', dss_damage_level(null) === null);

check('needs adjustment: 100% -> 2, 50-99% -> 1, <50% -> 0',
    [dss_needs_adjustment(1.0), dss_needs_adjustment(0.6), dss_needs_adjustment(0.5), dss_needs_adjustment(0.49), dss_needs_adjustment(0.0)] === [2, 1, 1, 0, 0]);
check('damage/needs: level 5, nothing covered -> 5', dss_rate_damage_needs(5, 0.0) === [5, false]);
check('damage/needs: level 4, 60% covered -> 3', dss_rate_damage_needs(4, 0.6) === [3, false]);
check('damage/needs: never below 1', dss_rate_damage_needs(2, 1.0) === [1, false]);
check('damage/needs: not assessed -> provisional midpoint 3 (not the lowest)', dss_rate_damage_needs(null, 0.0) === [3, true]);

check('vulnerable: 0->1, 1->2, 2->3, 3->4, 4->5, 9->5',
    array_map('dss_rate_vulnerable', [0, 1, 2, 3, 4, 9]) === [1, 2, 3, 4, 5, 5]);
check('household size: 1->1, 2->2, 3->2, 4->3, 5->3, 6->4, 7->4, 8->5, 12->5',
    array_map('dss_rate_size', [1, 2, 3, 4, 5, 6, 7, 8, 12]) === [1, 2, 2, 3, 3, 4, 4, 5, 5]);
check('confidence: 5/4/3/2/1 per verification, assessment and profile',
    [dss_rate_confidence(true, true, true), dss_rate_confidence(true, true, false), dss_rate_confidence(true, false, true),
     dss_rate_confidence(false, true, true), dss_rate_confidence(false, false, true)] === [5, 4, 3, 2, 1]);

// ---- formula
check('contribution = rating/5 x weight (e.g. 4/5 x 30 = 24)', dss_contribution('disaster_severity', 4) == 24.0);
$all5 = array_fill_keys(array_keys(DSS_WEIGHTS), 5);
$all1 = array_fill_keys(array_keys(DSS_WEIGHTS), 1);
check('all ratings 5 -> 100', dss_weighted_score($all5) == 100.0);
check('all ratings 1 -> 20 (lowest attainable)', dss_weighted_score($all1) == 20.0);
$ok = true;
foreach ([1, 2, 3, 4, 5] as $s) foreach ([1, 2, 3, 4, 5] as $d) foreach ([1, 3, 5] as $v) foreach ([1, 4] as $h) foreach ([1, 5] as $c) {
    $r = ['disaster_severity' => $s, 'damage_unmet_needs' => $d, 'vulnerable_members' => $v, 'household_size' => $h, 'assessment_confidence' => $c];
    if (dss_weighted_score($r) != 6 * $s + 5 * $d + 4 * $v + 3 * $h + 2 * $c) $ok = false;
}
check('score = 6S + 5D + 4V + 3H + 2C for 300 rating combinations (always a whole number)', $ok);

check('categories: 80 Critical, 79 High, 60 High, 59 Moderate, 40 Moderate, 39 Low, 20 Low',
    array_map('dss_priority_category', [80, 79, 60, 59, 40, 39, 20]) ===
    ['Critical Priority', 'High Priority', 'High Priority', 'Moderate Priority', 'Moderate Priority', 'Low Priority', 'Low Priority']);

// ---- needs coverage
$cats = ['Food', 'Water', 'Hygiene', 'Shelter', 'Medical'];
$cv = dss_needs_coverage(5, 1, ['Food' => 4, 'Water' => 18, 'Hygiene' => 2], $cats);
check('coverage: 5 members, food 4/3, water 18/15, hygiene 2/1, shelter 0/2, medical 0/1 -> 60%', round($cv['coverage'], 2) == 0.60, $cv);
$cv = dss_needs_coverage(2, 0, [], $cats);
check('coverage: no vulnerable member -> medical not needed (4 categories counted)', count($cv['categories']) === 4 && $cv['coverage'] == 0.0, $cv);
$cv = dss_needs_coverage(4, 0, [], ['Food', 'Water']);
check('coverage: only categories in the inventory are counted', count($cv['categories']) === 2, $cv);

// ---- research-paper hypothetical households (must match the document)
$hh = [
    'A' => ['disaster_severity' => dss_rate_severity('Critical', true), 'damage_unmet_needs' => dss_rate_damage_needs(dss_damage_level($A('Totally Damaged', 'Major')), 0.0)[0],
            'vulnerable_members' => dss_rate_vulnerable(3), 'household_size' => dss_rate_size(6), 'assessment_confidence' => dss_rate_confidence(true, true, true)],
    'B' => ['disaster_severity' => dss_rate_severity('High', false), 'damage_unmet_needs' => dss_rate_damage_needs(dss_damage_level($A('Major')), 0.6)[0],
            'vulnerable_members' => dss_rate_vulnerable(1), 'household_size' => dss_rate_size(4), 'assessment_confidence' => dss_rate_confidence(true, true, true)],
    'C' => ['disaster_severity' => dss_rate_severity('Medium', false), 'damage_unmet_needs' => dss_rate_damage_needs(null, 0.0)[0],
            'vulnerable_members' => dss_rate_vulnerable(0), 'household_size' => dss_rate_size(2), 'assessment_confidence' => dss_rate_confidence(false, false, true)],
    'D' => ['disaster_severity' => dss_rate_severity('Low', false), 'damage_unmet_needs' => dss_rate_damage_needs(dss_damage_level($A('None', 'Minor')), 1.0)[0],
            'vulnerable_members' => dss_rate_vulnerable(0), 'household_size' => dss_rate_size(1), 'assessment_confidence' => dss_rate_confidence(true, true, true)],
];
$expect = ['A' => [[5, 5, 4, 4, 5], 93, 'Critical Priority'], 'B' => [[3, 3, 2, 3, 5], 60, 'High Priority'],
           'C' => [[2, 3, 1, 2, 1], 39, 'Low Priority'], 'D' => [[1, 1, 1, 1, 5], 28, 'Low Priority']];
foreach ($hh as $k => $r) {
    $score = dss_weighted_score($r);
    check("paper household $k: ratings " . implode('/', $expect[$k][0]) . " -> score {$expect[$k][1]} ({$expect[$k][2]})",
        array_values($r) === $expect[$k][0] && $score == $expect[$k][1] && dss_priority_category($score) === $expect[$k][2], [$r, $score]);
}
check('paper household A step by step: 30 + 25 + 16 + 12 + 10 = 93',
    [dss_contribution('disaster_severity', 5), dss_contribution('damage_unmet_needs', 5), dss_contribution('vulnerable_members', 4),
     dss_contribution('household_size', 4), dss_contribution('assessment_confidence', 5)] == [30.0, 25.0, 16.0, 12.0, 10.0]);

echo "\nDSS WEIGHTED UNIT TEST: $pass/" . ($pass + $fail) . " passed\n";
exit($fail ? 1 : 0);

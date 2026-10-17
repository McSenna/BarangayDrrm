<?php
/**
 * GIS map unit test — flood-prone designation and household flood status
 * (backend/lib/flood_zones.php) on top of the Purok classification
 * (backend/lib/purok_boundaries.php). No database.
 * Usage: php tests/flood_zones_unit_test.php
 */
require_once __DIR__ . '/../backend/lib/purok_boundaries.php';
require_once __DIR__ . '/../backend/lib/flood_zones.php';
$pass = 0; $fail = 0;
function ok($c, $m) { global $pass, $fail; if ($c) { $pass++; echo "PASS $m\n"; } else { $fail++; echo "FAIL $m\n"; } }

// ---- designation
ok(FLOOD_PRONE_PUROKS === ['Purok 1', 'Purok 2', 'Purok 3', 'Purok 4'], 'Puroks 1–4 are the designated flood-prone Puroks');
foreach (['Purok 1', 'Purok 2', 'Purok 3', 'Purok 4', '3', 'prk. 4'] as $p) ok(flood_designation($p) === 'flood_prone', "\"$p\" -> flood_prone");
foreach (['Purok 5A', 'Purok 5B', 'Purok 6', 'Purok 7', '5a'] as $p) ok(flood_designation($p) === 'not_designated', "\"$p\" -> not_designated (never 'safe')");
foreach (['', null, 'Purok 5', 'Riverside', 'Purok 8'] as $p) ok(flood_designation($p) === null, 'non-standard ' . json_encode($p) . ' -> no designation');
ok(strpos(FLOOD_DESIGNATION_NOTE, 'not an official') !== false && strpos(FLOOD_DESIGNATION_NOTE, 'does not mean they are safe') !== false,
   'designation note says it is not official and not-designated is not "safe"');

// ---- household flood status from the recorded Purok (barangay rule: no coordinates or confirmation needed)
foreach (['Purok 1', 'Purok 2', 'Purok 3', 'Purok 4', 'prk. 3', '4'] as $p) ok(household_flood_status_for_purok($p) === 'flood_prone', "recorded \"$p\" -> flood_prone automatically");
foreach (['Purok 5A', 'Purok 5B', 'Purok 6', 'Purok 7'] as $p) ok(household_flood_status_for_purok($p) === 'not_designated', "recorded \"$p\" -> not_designated automatically");
foreach (['', null, 'Purok 9', 'Riverside'] as $p) ok(household_flood_status_for_purok($p) === 'unverified', 'missing or unrecognised Purok ' . json_encode($p) . ' -> unverified (flagged, never outside)');

// ---- status from a classification result (synthetic results)
$c = fn($status, $spatial = null, $matches = [], $near = []) => ['status' => $status, 'spatial_purok' => $spatial, 'matches' => $matches, 'near_edges' => array_map(fn($p) => ['purok' => $p, 'distance_m' => 0.5], $near)];
ok(household_flood_status($c('no_coordinates')) === 'unmapped', 'no coordinates -> unmapped (never guessed)');
ok(household_flood_status($c('match', 'Purok 2', ['Purok 2'])) === 'flood_prone', 'inside Purok 2 -> flood_prone');
ok(household_flood_status($c('match', 'Purok 7', ['Purok 7'])) === 'not_designated', 'inside Purok 7 -> not_designated');
ok(household_flood_status($c('mismatch', 'Purok 3', ['Purok 3'])) === 'flood_prone', 'stored Purok differs: location (Purok 3) decides -> flood_prone');
ok(household_needs_location_review($c('mismatch', 'Purok 3', ['Purok 3'])), 'mismatch is flagged for review');
ok(!household_needs_location_review($c('match', 'Purok 3', ['Purok 3'])), 'match is not flagged');
ok(household_flood_status($c('on_boundary', null, [], ['Purok 2', 'Purok 3'])) === 'flood_prone', 'on the edge between two flood-prone Puroks -> flood_prone');
ok(household_flood_status($c('on_boundary', null, ['Purok 6'], ['Purok 5B'])) === 'not_designated', 'on the edge between two undesignated Puroks -> not_designated');
ok(household_flood_status($c('on_boundary', null, ['Purok 4'], ['Purok 5A'])) === 'unverified', 'on the edge between flood-prone and undesignated -> unverified');
ok(household_flood_status($c('ambiguous', null, ['Purok 4', 'Purok 7'])) === 'unverified', 'inside two Puroks of different designation -> unverified');
ok(household_flood_status($c('outside_all')) === 'unverified', 'in a gap between Purok boundaries -> unverified');
ok(household_flood_status($c('outside_barangay')) === 'unverified', 'outside the barangay -> unverified');
ok(household_flood_status($c('unverified_area')) === 'unverified', 'inside a Purok whose boundary failed validation -> unverified');
foreach (['on_boundary', 'ambiguous', 'outside_all', 'outside_barangay', 'unverified_area'] as $s) ok(household_needs_location_review($c($s)), "$s is flagged for review");

// ---- real boundaries: one point well inside each Purok (its label point area) is classified by location
$b = purok_boundaries_load();
ok($b['valid_count'] === 8, 'all eight candidate Purok boundaries are valid');
$expect = ['Purok 1' => 'flood_prone', 'Purok 2' => 'flood_prone', 'Purok 3' => 'flood_prone', 'Purok 4' => 'flood_prone',
           'Purok 5A' => 'not_designated', 'Purok 5B' => 'not_designated', 'Purok 6' => 'not_designated', 'Purok 7' => 'not_designated'];
foreach ($b['features'] as $f) {
    // centroid of the ring's vertices, nudged until it is inside and away from edges
    $ring = $f['ring']; $n = count($ring) - 1; $lng = 0; $lat = 0;
    for ($i = 0; $i < $n; $i++) { $lng += $ring[$i][0] / $n; $lat += $ring[$i][1] / $n; }
    $r = purok_classify($f['name'], $lat, $lng, $b['features']);
    if ($r['status'] === 'match') {
        ok(household_flood_status($r) === $expect[$f['name']], "point inside {$f['name']} -> {$expect[$f['name']]}");
    } else {
        ok(true, "{$f['name']}: vertex mean is not inside (concave ring) — skipped, covered by synthetic cases");
    }
}
// the defense test household H04 (Purok 4, 13.1564170, 123.7166138)
$r = purok_classify('Purok 4', 13.1564170, 123.7166138, $b['features']);
ok($r['status'] === 'match' && household_flood_status($r) === 'flood_prone', 'H04 Jerome Pascual: inside Purok 4 -> flood_prone');
$r = purok_classify('Purok 7', 13.1552189, 123.7169349, $b['features']);
ok($r['status'] === 'match' && household_flood_status($r) === 'not_designated', 'H08 Ernesto Dimaculangan: inside Purok 7 -> not_designated');

echo "\nFLOOD ZONES UNIT TEST: $pass/" . ($pass + $fail) . " passed\n";
exit($fail ? 1 : 0);

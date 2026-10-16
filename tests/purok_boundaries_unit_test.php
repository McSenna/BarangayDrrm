<?php
/**
 * Phase 24 unit test — Purok boundary validation and household classification
 * (backend/lib/purok_boundaries.php). No database. Usage: php tests/purok_boundaries_unit_test.php
 */
require_once __DIR__ . '/../backend/lib/purok_boundaries.php';
$pass = 0; $fail = 0;
function ok($c, $m) { global $pass, $fail; if ($c) { $pass++; echo "PASS $m\n"; } else { $fail++; echo "FAIL $m\n"; } }

// ---- the supplied candidate file
$b = purok_boundaries_load();
$names = array_column($b['features'], 'name');
ok($b['file_found'], 'candidate GeoJSON found by the backend');
ok($names === BINITAYAN_PUROKS, 'all eight Puroks load with the correct names, in order: ' . implode(', ', $names));
$byName = array_combine($names, $b['features']);
// Purok 1: the supplied duplicate end vertex was removed (approved 2026-10-16, see properties.approved_edit).
ok($byName['Purok 1']['valid'] && $byName['Purok 1']['vertices'] === 7, 'Purok 1 is valid after the approved end-vertex removal (7 vertices)');
foreach (['Purok 2', 'Purok 3', 'Purok 4', 'Purok 5A', 'Purok 5B', 'Purok 6', 'Purok 7'] as $p) ok($byName[$p]['valid'], "$p passes validation");
ok($b['valid_count'] === 8, 'valid_count = 8');
foreach ($b['features'] as $f) {
    $r = $f['ring'];
    ok($r[0] === $r[count($r) - 1], "{$f['name']} ring is closed");
    ok($r[0][0] > 123 && $r[0][1] < 14, "{$f['name']} positions are [longitude, latitude]");
}

// ---- synthetic geometries written to temp files
function fc_file(array $features): string {
    $f = tempnam(sys_get_temp_dir(), 'pb');
    file_put_contents($f, json_encode(['type' => 'FeatureCollection', 'features' => $features]));
    return $f;
}
function feat($name, $ring) { return ['type' => 'Feature', 'properties' => ['name' => $name], 'geometry' => ['type' => 'Polygon', 'coordinates' => [$ring]]]; }
// a 0.0008° square inside the barangay (around 13.1560, 123.7160)
$sq = [[123.7156, 13.1556], [123.7164, 13.1556], [123.7164, 13.1564], [123.7156, 13.1564], [123.7156, 13.1556]];
$right = [[123.7164, 13.1556], [123.7172, 13.1556], [123.7172, 13.1564], [123.7164, 13.1564], [123.7164, 13.1556]];
$bow = [[123.7156, 13.1556], [123.7164, 13.1564], [123.7164, 13.1556], [123.7156, 13.1564], [123.7156, 13.1556]];
$swapped = array_map(fn($p) => [$p[1], $p[0]], $sq);
$open = array_slice($sq, 0, 4);
$t = purok_boundaries_load(fc_file([feat('Purok 3', $sq), feat('Purok 4', $right), feat('Purok 6', $bow), feat('Purok 7', $swapped), feat('Purok 2', $open), feat('Purok 9', $sq)]));
$tn = []; foreach ($t['features'] as $f) $tn[$f['name']][] = $f;
ok($tn['Purok 3'][0]['valid'] && $tn['Purok 4'][0]['valid'], 'simple squares are valid');
ok(!$tn['Purok 6'][0]['valid'] && in_array('ring crosses itself (self-intersection)', $tn['Purok 6'][0]['problems'], true), 'bow-tie polygon detected as self-intersecting');
ok(!$tn['Purok 7'][0]['valid'] && in_array('coordinates are not [longitude, latitude] near Binitayan', $tn['Purok 7'][0]['problems'], true), 'swapped [lat, lng] order detected');
ok(!$tn['Purok 2'][0]['valid'] && in_array('ring is not closed', $tn['Purok 2'][0]['problems'], true), 'unclosed ring detected');
ok(!$tn['Purok 9'][0]['valid'], 'non-standard name "Purok 9" rejected');
ok(isset($tn['Purok 1']) && $tn['Purok 1'][0]['problems'] === ['no boundary supplied'], 'missing Purok reported as "no boundary supplied"');
$far = [[123.80, 13.20], [123.81, 13.20], [123.81, 13.21], [123.80, 13.21], [123.80, 13.20]];
$x = purok_boundaries_load(fc_file([feat('Purok 5A', $far)]));
ok(!$x['features'][0]['valid'] && strpos(implode(' ', $x['features'][0]['problems']), 'outside the barangay boundary') !== false, 'polygon outside the barangay boundary flagged');

$F = $t['features'];
$c = purok_classify('Purok 3', 13.1560, 123.7160, $F);
ok($c['status'] === 'match' && $c['spatial_purok'] === 'Purok 3', 'point inside Purok 3, stored Purok 3 -> match');
$c = purok_classify('Purok 5A', 13.1560, 123.7160, $F);
ok($c['status'] === 'mismatch' && $c['spatial_purok'] === 'Purok 3', 'point inside Purok 3, stored Purok 5A -> mismatch (record not changed)');
$c = purok_classify('purok 3', 13.1560, 123.7160, $F);
ok($c['status'] === 'match', 'non-standard spelling "purok 3" normalised for comparison only');
$c = purok_classify('Purok 3', 13.1560, 123.7164, $F);
ok($c['status'] === 'on_boundary' && count($c['near_edges']) === 2, 'point on the shared edge of Purok 3 and 4 -> on_boundary (both edges listed)');
$c = purok_classify('Purok 3', 13.15600, 123.716395, $F); // ~0.5 m from the edge
ok($c['status'] === 'on_boundary', 'point 0.5 m from an edge -> on_boundary');
$c = purok_classify('Purok 3', 13.15600, 123.71635, $F); // ~5 m inside
ok($c['status'] === 'match', 'point 5 m inside -> match (not on boundary)');
$c = purok_classify('Purok 3', 13.1570, 123.7180, $F);
ok($c['status'] === 'outside_all' && $c['spatial_purok'] === null, 'point in the barangay but in no polygon -> outside_all');
$c = purok_classify('Purok 3', 13.30, 123.90, $F);
ok($c['status'] === 'outside_barangay', 'point outside the barangay boundary -> outside_barangay');
foreach ([[null, null], ['', ''], [null, '123.7'], ['abc', '123.7']] as $bad) {
    $c = purok_classify('Purok 3', $bad[0], $bad[1], $F);
    ok($c['status'] === 'no_coordinates' && $c['matches'] === [], 'missing/invalid coordinates ' . json_encode($bad) . ' -> no_coordinates, not classified');
}
// overlap -> ambiguous
$ov = [[123.7160, 13.1556], [123.7168, 13.1556], [123.7168, 13.1564], [123.7160, 13.1564], [123.7160, 13.1556]];
$o = purok_boundaries_load(fc_file([feat('Purok 3', $sq), feat('Purok 4', $ov)]));
$c = purok_classify('Purok 3', 13.1560, 123.7162, $o['features']);
ok($c['status'] === 'ambiguous' && $c['matches'] === ['Purok 3', 'Purok 4'], 'point inside two overlapping polygons -> ambiguous');
// invalid feature is never used as a confirmed area
$c = purok_classify('Purok 6', 13.1558, 123.7160, $t['features']);
ok($c['status'] !== 'match' && $c['spatial_purok'] !== 'Purok 6', 'point in an invalid (bow-tie) polygon is never classified into it');
// the real file: a point well inside Purok 1 (valid since the approved fix)
$c = purok_classify('Purok 1', 13.1555, 123.7134, $b['features']);
ok($c['status'] === 'match' && $c['spatial_purok'] === 'Purok 1', 'real data: point inside Purok 1 -> match');

echo "\nPUROK BOUNDARY UNIT TEST: $pass/" . ($pass + $fail) . " passed\n";
exit($fail ? 1 : 0);

<?php
/**
 * Phase 24 — candidate Purok boundaries and household-location review.
 *
 * Data: backend/data/binitayan_purok_boundaries_candidate.geojson (a copy of
 * frontend/src/data/…; built from the coordinates the project team supplied by
 * docs/purok_boundaries/build_purok_geojson.py). These are CANDIDATE
 * boundaries, not an official survey. They are kept separate from the
 * barangay boundary (backend/data/binitayanBoundary.json), which is unchanged
 * and still decides whether coordinates are accepted at all.
 *
 * Every feature is validated here on the server (name, coordinate order,
 * closed ring, enough vertices, simple ring = no self-intersection, inside
 * the barangay boundary). Only VALID features are used to classify
 * households. Classification is a review aid: it never changes a household's
 * stored Purok.
 */
require_once __DIR__ . '/puroks.php';
require_once __DIR__ . '/../utils/boundary_validator.php';

const PUROK_BOUNDARY_FILE = __DIR__ . '/../data/binitayan_purok_boundaries_candidate.geojson';
// A household closer than this to a Purok edge is "on the boundary" (needs a person to decide).
const PUROK_EDGE_TOLERANCE_M = 1.0;

/** Local metres per degree at Binitayan's latitude (equirectangular; fine for a ~1 km area). */
function purok_m_per_deg(): array
{
    return [111320 * cos(deg2rad(13.156)), 110540]; // [lng, lat]
}

/** Do segments p1-p2 and p3-p4 properly cross or touch? (points are [lng, lat]) */
function purok_segments_intersect(array $p1, array $p2, array $p3, array $p4): bool
{
    $o = function ($a, $b, $c) {
        $v = ($b[1] - $a[1]) * ($c[0] - $b[0]) - ($b[0] - $a[0]) * ($c[1] - $b[1]);
        return abs($v) < 1e-18 ? 0 : ($v > 0 ? 1 : 2);
    };
    $on = fn($a, $b, $c) => min($a[0], $c[0]) <= $b[0] && $b[0] <= max($a[0], $c[0]) && min($a[1], $c[1]) <= $b[1] && $b[1] <= max($a[1], $c[1]);
    $o1 = $o($p1, $p2, $p3); $o2 = $o($p1, $p2, $p4); $o3 = $o($p3, $p4, $p1); $o4 = $o($p3, $p4, $p2);
    if ($o1 !== $o2 && $o3 !== $o4) return true;
    if ($o1 === 0 && $on($p1, $p3, $p2)) return true;
    if ($o2 === 0 && $on($p1, $p4, $p2)) return true;
    if ($o3 === 0 && $on($p3, $p1, $p4)) return true;
    if ($o4 === 0 && $on($p3, $p2, $p4)) return true;
    return false;
}

/** True when no two non-adjacent edges of the closed ring touch or cross. */
function purok_ring_is_simple(array $ring): bool
{
    $n = count($ring) - 1; // edges (ring is closed: last == first)
    for ($i = 0; $i < $n; $i++) {
        for ($j = $i + 1; $j < $n; $j++) {
            if ($j === $i + 1 || ($i === 0 && $j === $n - 1)) continue; // adjacent edges share a vertex
            if (purok_segments_intersect($ring[$i], $ring[$i + 1], $ring[$j], $ring[$j + 1])) return false;
        }
    }
    return true;
}

/**
 * Loads and validates the candidate boundaries.
 * @return array{features: array, valid_count: int, file_found: bool}
 */
function purok_boundaries_load(?string $file = null): array
{
    $file = $file ?? PUROK_BOUNDARY_FILE;
    // Windows ACL probes can report unreadable while opening this file succeeds.
    // The actual read is authoritative; a failed read still produces unknown geography.
    $raw = @file_get_contents($file);
    if ($raw === false) return ['features' => [], 'valid_count' => 0, 'file_found' => false];
    $fc = json_decode($raw, true);
    $barangay = load_binitayan_boundary();
    $out = [];
    $seen = [];
    foreach (($fc['features'] ?? []) as $f) {
        $name = $f['properties']['name'] ?? '';
        $problems = [];
        if (!in_array($name, BINITAYAN_PUROKS, true)) $problems[] = "name \"$name\" is not a standard Binitayan Purok";
        if (isset($seen[$name])) $problems[] = "duplicate feature for $name";
        $seen[$name] = true;
        $g = $f['geometry'] ?? [];
        $ring = ($g['type'] ?? '') === 'Polygon' ? ($g['coordinates'][0] ?? []) : [];
        if (($g['type'] ?? '') !== 'Polygon') $problems[] = 'geometry is not a Polygon';
        if (count($ring) < 4) $problems[] = 'ring has fewer than 4 positions';
        $order_ok = true;
        foreach ($ring as $p) {
            if (!is_array($p) || count($p) < 2 || !is_numeric($p[0]) || !is_numeric($p[1])) { $order_ok = false; break; }
            // Binitayan: longitude ~123.7, latitude ~13.15. Swapped pairs would fail this.
            if (!($p[0] > 120 && $p[0] < 125 && $p[1] > 12 && $p[1] < 14.5)) { $order_ok = false; break; }
        }
        if (!$order_ok) $problems[] = 'coordinates are not [longitude, latitude] near Binitayan';
        $closed = count($ring) >= 2 && $ring[0] == $ring[count($ring) - 1];
        if (!$closed) $problems[] = 'ring is not closed';
        $simple = $order_ok && $closed && count($ring) >= 4 ? purok_ring_is_simple($ring) : false;
        if ($order_ok && $closed && count($ring) >= 4 && !$simple) $problems[] = 'ring crosses itself (self-intersection)';
        $outside_vertices = 0;
        if ($order_ok) {
            foreach ($ring as $p) if (!is_point_in_geojson(floatval($p[1]), floatval($p[0]), $barangay)) $outside_vertices++;
        }
        if ($outside_vertices) $problems[] = "$outside_vertices vertex(es) outside the barangay boundary";
        $out[] = [
            'name' => $name,
            'valid' => !$problems,
            'problems' => $problems,
            'vertices' => max(0, count($ring) - 1),
            'ring' => $order_ok ? array_map(fn($p) => [floatval($p[0]), floatval($p[1])], $ring) : [],
            'closure_gap_m' => $f['properties']['closure_gap_m'] ?? null,
            'closed_as_supplied' => $f['properties']['closed_as_supplied'] ?? null,
        ];
    }
    foreach (BINITAYAN_PUROKS as $p) {
        if (!isset($seen[$p])) $out[] = ['name' => $p, 'valid' => false, 'problems' => ['no boundary supplied'], 'vertices' => 0, 'ring' => [], 'closure_gap_m' => null, 'closed_as_supplied' => null];
    }
    return ['features' => $out, 'valid_count' => count(array_filter($out, fn($x) => $x['valid'])), 'file_found' => true];
}

/** Ray casting on a ring of [lng, lat]. */
function purok_point_in_ring(float $lat, float $lng, array $ring): bool
{
    $inside = false;
    for ($i = 0, $j = count($ring) - 1; $i < count($ring); $j = $i++) {
        [$xi, $yi] = $ring[$i];
        [$xj, $yj] = $ring[$j];
        if ((($yi > $lat) !== ($yj > $lat)) && ($lng < ($xj - $xi) * ($lat - $yi) / ($yj - $yi) + $xi)) $inside = !$inside;
    }
    return $inside;
}

/** Distance in metres from the point to the nearest edge of the ring. */
function purok_distance_to_ring_m(float $lat, float $lng, array $ring): float
{
    [$kx, $ky] = purok_m_per_deg();
    $px = $lng * $kx; $py = $lat * $ky;
    $best = INF;
    for ($i = 0; $i < count($ring) - 1; $i++) {
        $ax = $ring[$i][0] * $kx; $ay = $ring[$i][1] * $ky;
        $bx = $ring[$i + 1][0] * $kx; $by = $ring[$i + 1][1] * $ky;
        $dx = $bx - $ax; $dy = $by - $ay;
        $len2 = $dx * $dx + $dy * $dy;
        $t = $len2 > 0 ? max(0, min(1, (($px - $ax) * $dx + ($py - $ay) * $dy) / $len2)) : 0;
        $best = min($best, hypot($px - ($ax + $t * $dx), $py - ($ay + $t * $dy)));
    }
    return $best;
}

/**
 * Classifies one household location against the VALID boundaries.
 * status: no_coordinates | match | mismatch | outside_all | outside_barangay | on_boundary | ambiguous | unverified_area
 */
function purok_classify(?string $stored, $lat, $lng, array $features): array
{
    $stored_std = normalize_purok($stored);
    if ($lat === null || $lng === null || $lat === '' || $lng === '' || !is_numeric($lat) || !is_numeric($lng)) {
        return ['status' => 'no_coordinates', 'spatial_purok' => null, 'matches' => [], 'near_edges' => [], 'stored_standard' => $stored_std,
                'note' => 'No map location recorded — not classified.'];
    }
    $lat = floatval($lat); $lng = floatval($lng);
    $inside = []; $near = []; $unverified = [];
    foreach ($features as $f) {
        if (!$f['ring']) continue;
        $in = purok_point_in_ring($lat, $lng, $f['ring']);
        $d = purok_distance_to_ring_m($lat, $lng, $f['ring']);
        if (!$f['valid']) { if ($in) $unverified[] = $f['name']; continue; }
        if ($d <= PUROK_EDGE_TOLERANCE_M) $near[] = ['purok' => $f['name'], 'distance_m' => round($d, 2)];
        if ($in) $inside[] = $f['name'];
    }
    $r = ['spatial_purok' => null, 'matches' => $inside, 'near_edges' => $near, 'stored_standard' => $stored_std, 'unverified_areas' => $unverified];
    if ($near) {
        $r['status'] = 'on_boundary';
        $r['note'] = 'Within ' . PUROK_EDGE_TOLERANCE_M . ' m of a Purok edge (' . implode(', ', array_column($near, 'purok')) . ') — confirm on site.';
    } elseif (count($inside) > 1) {
        $r['status'] = 'ambiguous';
        $r['note'] = 'Inside more than one Purok polygon (' . implode(', ', $inside) . ') — the boundaries overlap here.';
    } elseif (count($inside) === 1) {
        $r['spatial_purok'] = $inside[0];
        if ($stored_std === $inside[0]) {
            $r['status'] = 'match';
            $r['note'] = 'Location agrees with the stored Purok.';
        } else {
            $r['status'] = 'mismatch';
            $r['note'] = "Location is inside {$inside[0]} but the record says " . ($stored ?: 'no Purok') . '. The record is not changed — verify and correct it if needed.';
        }
    } elseif ($unverified) {
        $r['status'] = 'unverified_area';
        $r['note'] = 'Inside the candidate area of ' . implode(', ', $unverified) . ', whose boundary failed validation — cannot be classified yet.';
    } else {
        static $barangay = null;
        if ($barangay === null) $barangay = load_binitayan_boundary();
        if (!is_point_in_geojson($lat, $lng, $barangay)) {
            $r['status'] = 'outside_barangay';
            $r['note'] = 'Outside the Barangay Binitayan boundary (an older record) — correct the location; new coordinates outside the barangay are refused.';
        } else {
            $r['status'] = 'outside_all';
            $r['note'] = 'Inside the barangay but not inside any validated Purok polygon (a gap between the candidate boundaries).';
        }
    }
    return $r;
}

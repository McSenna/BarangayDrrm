<?php
/**
 * Flood-prone Purok designation (GIS map).
 *
 * Puroks 1–4 are designated flood-prone in this system by the barangay. This
 * is a system designation, NOT an official or measured flood-hazard
 * assessment, and the other Puroks are "not currently designated" — never
 * "safe". The frontend mirrors this list in src/config/floodZones.js;
 * tests/purok_boundaries_js_test.mjs checks that the two agree.
 *
 * A household's flood status comes from its recorded Purok (barangay rule):
 * every household in Puroks 1–4 is inside the designated flood zone and every
 * household in Puroks 5A–7 is outside it, with no coordinates or administrator
 * confirmation needed (household_flood_status_for_purok). A missing or
 * unrecognised Purok is "unverified", never guessed.
 *
 * household_flood_status() is the separate LOCATION check: where the saved map
 * point falls (point-in-polygon against lib/purok_boundaries.php). It is shown
 * for location review only and never changes the flood status or points.
 */
require_once __DIR__ . '/puroks.php';

const FLOOD_PRONE_PUROKS = ['Purok 1', 'Purok 2', 'Purok 3', 'Purok 4'];

const FLOOD_DESIGNATION_NOTE = 'Puroks 1–4 are designated flood-prone in the barangay mapping system. '
    . 'This is a barangay designation, not an official flood-hazard assessment or a measure of flood severity. '
    . 'Puroks without the designation are "not currently designated", which does not mean they are safe from flooding.';

/** 'flood_prone' or 'not_designated' for a standard Purok name; null for anything else. */
function flood_designation(?string $purok): ?string
{
    $std = normalize_purok($purok);
    if ($std === null) return null;
    return in_array($std, FLOOD_PRONE_PUROKS, true) ? 'flood_prone' : 'not_designated';
}

/** Household flood status from its recorded Purok: flood_prone | not_designated | unverified. */
function household_flood_status_for_purok(?string $purok): string
{
    return flood_designation($purok) ?? 'unverified';
}

/**
 * Flood designation where the saved map point lies, from its purok_classify() result:
 *   flood_prone | not_designated  — the location lies in Puroks with that designation
 *   unverified                    — has coordinates, but they cannot be placed in one designation
 *                                   (gap between Puroks, outside the barangay, edge between a
 *                                   flood-prone and an undesignated Purok, overlap of the two)
 *   unmapped                      — no coordinates recorded
 *
 * A point within the edge tolerance of one or more Purok edges is decided by
 * every Purok it is inside or next to: if they all share one designation, that
 * designation applies; otherwise it is unverified. This handles points on a
 * shared edge the same way every time.
 */
function household_flood_status(array $c): string
{
    switch ($c['status']) {
        case 'no_coordinates':
            return 'unmapped';
        case 'match':
        case 'mismatch':
            return flood_designation($c['spatial_purok']) ?? 'unverified';
        case 'on_boundary':
        case 'ambiguous':
            $puroks = array_unique(array_merge($c['matches'] ?? [], array_column($c['near_edges'] ?? [], 'purok')));
            $designations = array_unique(array_filter(array_map('flood_designation', $puroks)));
            return count($designations) === 1 && count($puroks) > 0 ? reset($designations) : 'unverified';
        default: // outside_all, outside_barangay, unverified_area
            return 'unverified';
    }
}

/** Classification results that an official should look at (stored Purok and location disagree or are unclear). */
function household_needs_location_review(array $c): bool
{
    return in_array($c['status'], ['mismatch', 'on_boundary', 'ambiguous', 'outside_all', 'outside_barangay', 'unverified_area'], true);
}

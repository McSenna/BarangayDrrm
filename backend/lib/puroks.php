<?php
/**
 * Standard Purok list for Barangay Binitayan (Phase 19).
 *
 * Source: the Purok list used in the capstone paper's demographic tables
 * (Purok 1, 2, 3, 4, 5A, 5B, 6, 7). New and edited records must use one of
 * these exact values. Existing records are NOT rewritten automatically; the
 * Administrator maps old values with the Purok Cleanup page
 * (backend/maintenance/*).
 */

const BINITAYAN_PUROKS = ['Purok 1', 'Purok 2', 'Purok 3', 'Purok 4', 'Purok 5A', 'Purok 5B', 'Purok 6', 'Purok 7'];

/**
 * Returns the standard Purok name for a value such as "3", "purok 3",
 * "Purok3", "Prk. 5a" or "P-5B", or null if it cannot be matched with
 * certainty (e.g. "Demo-3" or "Riverside").
 */
function normalize_purok($value)
{
    if ($value === null) return null;
    $v = strtoupper(trim((string) $value));
    if ($v === '') return null;

    // Remove a leading "PUROK", "PRK", "PRK." or "P" label and separators.
    $v = preg_replace('/^(PUROK|PRK\.?|P)\s*[-.#:]?\s*/', '', $v);
    $v = preg_replace('/\s+/', '', $v);

    if (preg_match('/^([1-7])$/', $v, $m)) {
        $candidate = 'Purok ' . $m[1];
    } elseif (preg_match('/^5([AB])$/', $v, $m)) {
        $candidate = 'Purok 5' . $m[1];
    } else {
        return null;
    }
    return in_array($candidate, BINITAYAN_PUROKS, true) ? $candidate : null;
}

/**
 * Key used when two purok values must be compared (DSS location factor).
 * Standard values compare by their standard name; values that cannot be
 * normalised fall back to the exact trimmed text, so legacy data behaves
 * exactly as it did before Phase 19.
 */
function purok_match_key($value)
{
    $normalized = normalize_purok($value);
    return $normalized ?? trim((string) $value);
}

/**
 * Validates a purok coming from a form. Returns the standard name, or null
 * when the value is not on the list (caller responds 400).
 */
function validate_purok_input($value)
{
    $value = trim((string) $value);
    if (in_array($value, BINITAYAN_PUROKS, true)) return $value;
    return normalize_purok($value);
}

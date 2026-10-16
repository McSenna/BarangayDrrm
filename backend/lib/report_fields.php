<?php
/**
 * Phase 23 — optional incident coordinates and immediate needs on a disaster
 * report (Automation of Reporting). Both are validated on the server:
 * coordinates must be a pair inside the Binitayan boundary; needs must come
 * from the fixed list below.
 */
require_once __DIR__ . '/../utils/boundary_validator.php';
require_once __DIR__ . '/report_ref.php';

const REPORT_NEEDS = ['Food', 'Water', 'Hygiene', 'Shelter', 'Medical', 'Clothing', 'Other'];

/** True once migration_phase23_core_modules.sql has been run. */
function reports_have_phase23_columns(PDO $conn): bool
{
    static $cache = null;
    if ($cache === null) $cache = (bool) $conn->query("SHOW COLUMNS FROM disaster_reports LIKE 'reported_needs'")->fetch();
    return $cache;
}

/**
 * @return array [bool ok, ?string value (comma list in REPORT_NEEDS order), ?string error]
 */
function parse_reported_needs($input): array
{
    if ($input === null || $input === '' || $input === []) return [true, null, null];
    $list = is_array($input) ? $input : explode(',', (string) $input);
    $clean = [];
    foreach ($list as $n) {
        $n = trim((string) $n);
        if ($n === '') continue;
        if (!in_array($n, REPORT_NEEDS, true)) {
            return [false, null, 'Unknown need "' . mb_substr($n, 0, 30) . '". Choose from: ' . implode(', ', REPORT_NEEDS) . '.'];
        }
        $clean[$n] = true;
    }
    $ordered = array_values(array_filter(REPORT_NEEDS, fn($n) => isset($clean[$n])));
    return [true, $ordered ? implode(',', $ordered) : null, null];
}

/** @return array [bool ok, ?float lat, ?float lng, ?string error] */
function parse_report_coordinates($lat, $lng): array
{
    $check = validate_household_coordinates($lat, $lng);
    if (!$check['valid']) return [false, null, null, $check['message']];
    if ($lat === null || $lat === '' || $lng === null || $lng === '') return [true, null, null, null];
    return [true, round(floatval($lat), 7), round(floatval($lng), 7), null];
}

/* ------------------------------------------------------------------
 * Phase 25 — official-led assessment fields (field visits and paper forms).
 * report_date = the ORIGINAL date the assessment was made (from the visit or
 * the paper form); created_at = when it was ENCODED; updated_at = last change.
 * ------------------------------------------------------------------ */
const REPORT_COLLECTION_METHODS = ['Field Visit', 'Paper Form', 'Interview', 'Barangay Records', 'Direct Entry'];
const REPORT_DISPLACEMENT = ['Not Displaced', 'Staying with Relatives', 'In Evacuation Center', 'Other Shelter'];

function reports_have_phase25_columns(PDO $conn): bool
{
    static $cache = null;
    if ($cache === null) $cache = (bool) $conn->query("SHOW COLUMNS FROM disaster_reports LIKE 'collection_method'")->fetch();
    return $cache;
}

/**
 * Validates the Phase 25 assessment fields that were SENT (absent keys are not
 * returned, so updates change only what was sent).
 * @return array [bool ok, array fields, ?string error]
 */
function parse_assessment_fields(array $data, PDO $conn): array
{
    $f = [];
    if (array_key_exists('event_id', $data)) {
        $raw = $data['event_id'];
        if ($raw === null || $raw === '') {
            $f['event_id'] = null;
        } else {
            $id = (is_int($raw) || (is_string($raw) && preg_match('/^\s*\d+\s*$/', $raw))) ? intval($raw) : 0;
            if ($id <= 0) return [false, [], "Please choose a valid disaster event."];
            $st = $conn->prepare("SELECT event_id FROM disaster_events WHERE event_id = :id");
            $st->execute([':id' => $id]);
            if (!$st->fetch()) return [false, [], "The selected disaster event could not be found."];
            $f['event_id'] = $id;
        }
    }
    if (array_key_exists('collection_method', $data)) {
        $m = $data['collection_method'];
        if ($m === null || $m === '') $f['collection_method'] = null;
        elseif (is_string($m) && in_array($m, REPORT_COLLECTION_METHODS, true)) $f['collection_method'] = $m;
        else return [false, [], "Choose how the information was collected: " . implode(', ', REPORT_COLLECTION_METHODS) . "."];
    }
    if (array_key_exists('paper_form_no', $data)) {
        $p = is_string($data['paper_form_no']) ? strtoupper(trim(preg_replace('/\s+/', ' ', $data['paper_form_no']))) : '';
        if ($p !== '' && !preg_match('/^[A-Z0-9][A-Z0-9 \/\-]{0,39}$/', $p)) {
            return [false, [], "The paper form number may use letters, numbers, spaces, '-' and '/', up to 40 characters (e.g. P3-0012)."];
        }
        $f['paper_form_no'] = $p === '' ? null : $p;
    }
    if (array_key_exists('field_assessor', $data)) {
        $a = is_string($data['field_assessor']) ? trim(preg_replace('/\s+/', ' ', $data['field_assessor'])) : '';
        if (mb_strlen($a) > 150) return [false, [], "The field assessor name is too long (150 characters at most)."];
        $f['field_assessor'] = $a === '' ? null : $a;
    }
    if (array_key_exists('displacement_status', $data)) {
        $d = $data['displacement_status'];
        if ($d === null || $d === '') $f['displacement_status'] = null;
        elseif (is_string($d) && in_array($d, REPORT_DISPLACEMENT, true)) $f['displacement_status'] = $d;
        else return [false, [], "Choose the displacement status: " . implode(', ', REPORT_DISPLACEMENT) . "."];
    }
    if (($f['collection_method'] ?? null) === 'Paper Form' && empty($f['paper_form_no'])) {
        return [false, [], "A paper form needs its form number (written on the form), so it cannot be encoded twice."];
    }
    return [true, $f, null];
}

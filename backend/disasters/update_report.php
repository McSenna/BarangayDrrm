<?php
/**
 * Phase 21 — update the details of a recorded disaster report.
 *
 * Who: Administrator and Relief Personnel ("update verified disaster
 * information"). Residents cannot call this endpoint.
 * What: disaster type, severity, location, description, report date and time.
 * The verification status is NOT changed here (verify / reject stay with the
 * Administrator). Every change is written to the audit log with the old and
 * new values, so an update to a verified report is traceable.
 *
 * Body (JSON): { report_id, disaster_type, severity, location, description,
 *                report_date (YYYY-MM-DD), report_time (HH:MM, optional) }
 */
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../lib/report_fields.php';

require_login(['admin', 'relief_personnel', 'field_officer']);

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(["success" => false, "message" => "Method not allowed."]);
    exit();
}

$data = json_decode(file_get_contents("php://input"), true);
if (!is_array($data)) $data = [];

function bad($code, $msg)
{
    http_response_code($code);
    echo json_encode(["success" => false, "message" => $msg]);
    exit();
}

$raw_id = $data['report_id'] ?? null;
$report_id = (is_int($raw_id) || (is_string($raw_id) && preg_match('/^\s*\d+\s*$/', $raw_id))) ? intval($raw_id) : 0;
if ($report_id <= 0) bad(400, "The disaster report could not be found. Please refresh the page and try again.");

$disaster_type = trim((string) ($data['disaster_type'] ?? ''));
$severity = (string) ($data['severity'] ?? '');
$location = trim((string) ($data['location'] ?? ''));
$description = trim((string) ($data['description'] ?? ''));
$report_date = (string) ($data['report_date'] ?? '');
$report_time = isset($data['report_time']) && $data['report_time'] !== '' ? (string) $data['report_time'] : null;

if ($disaster_type === '' || !in_array($severity, ['Low', 'Medium', 'High', 'Critical'], true) || $location === '') {
    bad(400, "Please select a disaster type and severity, and enter the location.");
}
if (mb_strlen($location) > 255 || mb_strlen($description) > 5000) bad(400, "The location or description is too long.");
$d = DateTime::createFromFormat('Y-m-d', $report_date);
if (!$d || $d->format('Y-m-d') !== $report_date || $report_date > date('Y-m-d')) bad(400, "Please enter a valid report date (not in the future).");
if ($report_time !== null && !preg_match('/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/', $report_time)) bad(400, "Please enter a valid report time.");

// Phase 23: coordinates and immediate needs are updated only when sent.
$set_coords = array_key_exists('latitude', $data) || array_key_exists('longitude', $data);
$set_needs = array_key_exists('reported_needs', $data);
if ($set_coords) {
    [$ok, $rep_lat, $rep_lng, $err] = parse_report_coordinates($data['latitude'] ?? null, $data['longitude'] ?? null);
    if (!$ok) bad(400, $err);
}
if ($set_needs) {
    [$ok, $reported_needs, $err] = parse_reported_needs($data['reported_needs']);
    if (!$ok) bad(400, $err);
}

$conn = (new Database())->connect();
field_require_report($conn, $report_id);
$p23 = reports_have_phase23_columns($conn);
// Phase 25: assessment fields (event, collection method, paper form no., field assessor, displacement) — only those sent.
$assess = [];
if (reports_have_phase25_columns($conn)) {
    [$a_ok, $assess, $a_err] = parse_assessment_fields($data, $conn);
    if (!$a_ok) bad(400, $a_err);
}

$type_check = $conn->prepare("SELECT type_id FROM disaster_types WHERE type_name = :t AND is_active = 1");
$type_check->execute([':t' => $disaster_type]);
if (!$type_check->fetch()) bad(400, "The selected disaster type is not available. Please choose another type.");

try {
    $conn->beginTransaction();
    $cur = $conn->prepare("SELECT * FROM disaster_reports WHERE report_id = :id FOR UPDATE");
    $cur->execute([':id' => $report_id]);
    $old = $cur->fetch(PDO::FETCH_ASSOC);
    if (!$old) {
        $conn->rollBack();
        bad(404, "The disaster report could not be found. It may have been removed.");
    }

    $new = [
        'disaster_type' => $disaster_type, 'severity' => $severity, 'location' => $location,
        'description' => $description, 'report_date' => $report_date,
        'report_time' => $report_time === null ? null : (strlen($report_time) === 5 ? "$report_time:00" : $report_time),
    ];
    if ($p23 && $set_coords) {
        $new['latitude'] = $rep_lat === null ? null : number_format($rep_lat, 7, '.', '');
        $new['longitude'] = $rep_lng === null ? null : number_format($rep_lng, 7, '.', '');
    }
    if ($p23 && $set_needs) $new['reported_needs'] = $reported_needs;
    foreach ($assess as $k => $v) $new[$k] = $v;
    if (!empty($assess['paper_form_no']) && $assess['paper_form_no'] !== ($old['paper_form_no'] ?? null)) {
        $pf = $conn->prepare("SELECT report_id FROM disaster_reports WHERE paper_form_no = :p AND report_id <> :id");
        $pf->execute([':p' => $assess['paper_form_no'], ':id' => $report_id]);
        if ($pf->fetch()) { $conn->rollBack(); bad(409, "Paper form {$assess['paper_form_no']} is already recorded on another report."); }
    }
    if (($new['collection_method'] ?? $old['collection_method'] ?? null) === 'Paper Form' && empty($new['paper_form_no'] ?? $old['paper_form_no'] ?? null)) {
        $conn->rollBack();
        bad(400, "A paper form needs its form number.");
    }
    $changes = [];
    foreach ($new as $k => $v) {
        if ((string) ($old[$k] ?? '') !== (string) ($v ?? '')) {
            $from = $k === 'description' ? '(text)' : ($old[$k] ?? '—');
            $to = $k === 'description' ? '(text)' : ($v ?? '—');
            $changes[] = "$k: $from -> $to";
        }
    }
    if (!$changes) {
        $conn->rollBack();
        echo json_encode(["success" => true, "message" => "No changes to save.", "changed" => false]);
        exit();
    }

    $sets = [];
    $params = [':id' => $report_id];
    foreach ($new as $k => $v) {
        $sets[] = "$k = :$k";
        $params[":$k"] = $v;
    }
    $upd = $conn->prepare("UPDATE disaster_reports SET " . implode(', ', $sets) . " WHERE report_id = :id");
    $upd->execute($params);
    log_action($conn, "Disaster report updated",
        "report_id: $report_id (status {$old['status']}), by {$_SESSION['role']}; " . implode('; ', $changes));
    $conn->commit();
} catch (Exception $e) {
    if ($conn->inTransaction()) $conn->rollBack();
    error_log("disasters/update_report.php: " . $e->getMessage());
    bad(500, "We couldn't update this disaster report. Please try again.");
}

echo json_encode(["success" => true, "message" => "Disaster report #$report_id updated. The change is recorded in the audit log.", "changed" => true]);

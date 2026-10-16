<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../lib/report_fields.php';

// Phase 21 — disaster reports are recorded by authorized personnel only
// (Administrator / Barangay Official and Relief Personnel), for a registered
// household. Residents can no longer submit reports, even through the API.
require_login(['admin', 'relief_personnel']);

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(["success" => false, "message" => "This action is not allowed. Please try again."]);
    exit();
}

$data = json_decode(file_get_contents("php://input"), true);

$disaster_type = $data['disaster_type'] ?? '';
$location = trim($data['location'] ?? '');
$description = trim($data['description'] ?? '');
$report_date = $data['report_date'] ?? date('Y-m-d');
$report_time = !empty($data['report_time']) ? $data['report_time'] : null;
$severity = $data['severity'] ?? '';
$raw_household = $data['household_id'] ?? null;
$household_id = (is_int($raw_household) || (is_string($raw_household) && preg_match('/^\s*\d+\s*$/', $raw_household)))
    ? intval($raw_household) : 0;

// Severity stays a fixed list (see migration note): it feeds directly into the
// Decision Support priority-scoring formula (Phase 6) and is not admin-editable.
$valid_severity = ['Low', 'Medium', 'High', 'Critical'];

if ($household_id <= 0) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "Please select the affected household."]);
    exit();
}
if ($disaster_type === '' || !in_array($severity, $valid_severity, true) || $location === '') {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "Please select a disaster type and severity, and enter the location."]);
    exit();
}
if (mb_strlen($location) > 255 || mb_strlen($description) > 5000) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "The location or description is too long."]);
    exit();
}
$d = DateTime::createFromFormat('Y-m-d', (string) $report_date);
if (!$d || $d->format('Y-m-d') !== $report_date || $report_date > date('Y-m-d')) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "Please enter a valid report date (not in the future)."]);
    exit();
}
if ($report_time !== null && !preg_match('/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/', (string) $report_time)) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "Please enter a valid report time."]);
    exit();
}

// Phase 23: optional incident coordinates (inside Binitayan) and immediate needs.
[$coords_ok, $rep_lat, $rep_lng, $coords_err] = parse_report_coordinates($data['latitude'] ?? null, $data['longitude'] ?? null);
if (!$coords_ok) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => $coords_err]);
    exit();
}
[$needs_ok, $reported_needs, $needs_err] = parse_reported_needs($data['reported_needs'] ?? null);
if (!$needs_ok) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => $needs_err]);
    exit();
}

$database = new Database();
$conn = $database->connect();

// Disaster type must match an active type managed under System Settings > Disaster Settings (Phase 14)
$typeCheck = $conn->prepare("SELECT type_id FROM disaster_types WHERE type_name = :type AND is_active = 1");
$typeCheck->execute([':type' => $disaster_type]);
if (!$typeCheck->fetch()) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "The selected disaster type is no longer available. Please choose another type."]);
    exit();
}

// The household must exist (validated server-side; never trusted from the browser).
$hh = $conn->prepare("SELECT household_id, head_of_family FROM households WHERE household_id = :id");
$hh->execute([':id' => $household_id]);
$household = $hh->fetch(PDO::FETCH_ASSOC);
if (!$household) {
    http_response_code(404);
    echo json_encode(["success" => false, "message" => "The selected household could not be found."]);
    exit();
}

// Phase 25 — official field / paper assessment fields and duplicate protection.
$p25 = reports_have_phase25_columns($conn);
$assess = [];
if ($p25) {
    [$a_ok, $assess, $a_err] = parse_assessment_fields(is_array($data) ? $data : [], $conn);
    if (!$a_ok) {
        http_response_code(400);
        echo json_encode(["success" => false, "message" => $a_err]);
        exit();
    }
    // 1. The same paper form can be encoded only once.
    if (!empty($assess['paper_form_no'])) {
        $pf = $conn->prepare("SELECT report_id, created_at FROM disaster_reports WHERE paper_form_no = :p");
        $pf->execute([':p' => $assess['paper_form_no']]);
        if ($row = $pf->fetch(PDO::FETCH_ASSOC)) {
            http_response_code(409);
            echo json_encode(["success" => false, "code" => "duplicate_paper_form",
                "message" => "Paper form {$assess['paper_form_no']} was already encoded as " . report_reference_no($row) . ". It was not saved again.",
                "existing_report_id" => intval($row['report_id'])]);
            exit();
        }
    }
    // 2. A likely duplicate: same household, same assessment date, same disaster type, not rejected.
    $dup = $conn->prepare("SELECT report_id, created_at, status FROM disaster_reports
                           WHERE household_id = :h AND report_date = :d AND disaster_type = :t AND status <> 'Rejected' LIMIT 1");
    $dup->execute([':h' => $household_id, ':d' => $report_date, ':t' => $disaster_type]);
    $existing = $dup->fetch(PDO::FETCH_ASSOC);
    if ($existing && (($data['confirm_not_duplicate'] ?? null) !== true)) {
        http_response_code(409);
        echo json_encode(["success" => false, "code" => "possible_duplicate",
            "message" => "{$household['head_of_family']} already has a $disaster_type report dated $report_date (" . report_reference_no($existing) . ", {$existing['status']}). "
                       . "If this is a different assessment, confirm that it is not a duplicate; otherwise update the existing report.",
            "existing_report_id" => intval($existing['report_id'])]);
        exit();
    }
}

$p23 = reports_have_phase23_columns($conn);
$assess_cols = array_keys($assess);
$stmt = $conn->prepare(
    "INSERT INTO disaster_reports (user_id, household_id, disaster_type, location, description, report_date, report_time, severity, status"
    . ($p23 ? ", latitude, longitude, reported_needs" : "")
    . implode('', array_map(fn($c) => ", $c", $assess_cols)) . ")
     VALUES (:user_id, :household_id, :disaster_type, :location, :description, :report_date, :report_time, :severity, 'Pending'"
    . ($p23 ? ", :latitude, :longitude, :reported_needs" : "")
    . implode('', array_map(fn($c) => ", :a_$c", $assess_cols)) . ")"
);
$params = [
    ':user_id' => $_SESSION['user_id'],
    ':household_id' => $household_id,
    ':disaster_type' => $disaster_type,
    ':location' => $location,
    ':description' => $description,
    ':report_date' => $report_date,
    ':report_time' => $report_time,
    ':severity' => $severity,
];
if ($p23) $params += [':latitude' => $rep_lat, ':longitude' => $rep_lng, ':reported_needs' => $reported_needs];
foreach ($assess as $c => $v) $params[":a_$c"] = $v;
try {
    $stmt->execute($params);
} catch (PDOException $e) {
    // Two clerks encoding the same paper form at the same moment: the UNIQUE index decides.
    if ($e->getCode() === '23000' && !empty($assess['paper_form_no'])) {
        http_response_code(409);
        echo json_encode(["success" => false, "code" => "duplicate_paper_form", "message" => "Paper form {$assess['paper_form_no']} was already encoded. It was not saved again."]);
        exit();
    }
    throw $e;
}

// Phase 17 fix: capture the new report's ID BEFORE log_action() runs its own
// INSERT into audit_logs (lastInsertId() follows the most recent insert).
$report_id = $conn->lastInsertId();

log_action($conn, "Disaster report recorded", "report_id: $report_id, household_id: $household_id ({$household['head_of_family']}), $disaster_type at $location, recorded by {$_SESSION['role']}"
    . (!empty($assess['collection_method']) ? ", collected by: {$assess['collection_method']}" : "")
    . (!empty($assess['paper_form_no']) ? ", paper form {$assess['paper_form_no']}" : "")
    . ", assessment date $report_date"
    . (!empty($existing) ? ", confirmed NOT a duplicate of report {$existing['report_id']}" : ""));

http_response_code(201);
$reference_no = report_reference_no(['report_id' => $report_id, 'created_at' => date('Y-m-d H:i:s')]);
echo json_encode(["success" => true, "message" => "Disaster report $reference_no recorded for {$household['head_of_family']}. It is Pending until the Administrator verifies it.", "report_id" => $report_id, "reference_no" => $reference_no]);

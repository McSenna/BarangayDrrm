<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../utils/boundary_validator.php';
require_once __DIR__ . '/../lib/puroks.php';
require_once __DIR__ . '/../lib/household_counts.php';
require_once __DIR__ . '/../lib/allocation_workflow.php';

require_login(['admin']);

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(["success" => false, "message" => "Method not allowed."]);
    exit();
}

$data = json_decode(file_get_contents("php://input"), true);
try {
    if (!is_array($data)) throw new InvalidArgumentException('Send a valid household record.');
    $reported_counts = household_reported_counts($data);
} catch (InvalidArgumentException $e) {
    http_response_code(400); echo json_encode(['success'=>false,'message'=>$e->getMessage()]); exit;
}

$head_of_family = trim($data['head_of_family'] ?? '');
$purok = trim($data['purok'] ?? '');
$address = trim($data['address'] ?? '');
$number_of_members = $reported_counts['number_of_members'];
$contact_number = trim($data['contact_number'] ?? '');
$latitude = $data['latitude'] !== '' && $data['latitude'] !== null ? floatval($data['latitude']) : null;
$longitude = $data['longitude'] !== '' && $data['longitude'] !== null ? floatval($data['longitude']) : null;
$user_id = !empty($data['user_id']) ? intval($data['user_id']) : null;

extract($reported_counts, EXTR_OVERWRITE);

if ($head_of_family === '' || $purok === '' || $address === '') {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "Please enter the household head, purok, and address."]);
    exit();
}

// Phase 19: purok must be one of the standard Binitayan puroks so that the
// DSS location factor and the map compare like with like.
$standard_purok = validate_purok_input($purok);
if ($standard_purok === null) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "Please select a valid purok (" . implode(', ', BINITAYAN_PUROKS) . ")."]);
    exit();
}
$purok = $standard_purok;

// Backend-authoritative boundary validation (Step 5). This is independent of
// any frontend check — a request calling this endpoint directly (bypassing
// React) is validated exactly the same way. Coordinates are still optional;
// only a provided, out-of-boundary (or otherwise invalid) pair is rejected,
// and rejection happens BEFORE the INSERT below.
$coordCheck = validate_household_coordinates($data['latitude'] ?? null, $data['longitude'] ?? null);
if (!$coordCheck['valid']) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => $coordCheck['message']]);
    exit();
}

$database = new Database();
$conn = $database->connect();

// The household and its first allocation round (PENDING_ASSESSMENT) are created together.
$conn->beginTransaction();
$stmt = $conn->prepare(
    "INSERT INTO households (
        user_id, head_of_family, purok, address, number_of_members,
        vulnerable_members, children_count, seniors_count, pwd_count, pregnant_count,
        medical_needs_count, other_vulnerable_count, contact_number, latitude, longitude
     ) VALUES (
        :user_id, :head_of_family, :purok, :address, :number_of_members,
        :vulnerable_members, :children_count, :seniors_count, :pwd_count, :pregnant_count,
        :medical_needs_count, :other_vulnerable_count, :contact_number, :latitude, :longitude
     )"
);

$stmt->execute([
    ':user_id' => $user_id,
    ':head_of_family' => $head_of_family,
    ':purok' => $purok,
    ':address' => $address,
    ':number_of_members' => $number_of_members,
    ':vulnerable_members' => $vulnerable_members,
    ':children_count' => $children_count,
    ':seniors_count' => $seniors_count,
    ':pwd_count' => $pwd_count,
    ':pregnant_count' => $pregnant_count,
    ':medical_needs_count' => $medical_needs_count,
    ':other_vulnerable_count' => $other_vulnerable_count,
    ':contact_number' => $contact_number,
    ':latitude' => $latitude,
    ':longitude' => $longitude,
]);

// Phase 17 fix: capture the new household's ID before log_action() inserts
// into audit_logs, which would otherwise overwrite lastInsertId() (see
// disasters/create_report.php for the same bug pattern).
$household_id = $conn->lastInsertId();

log_action($conn, "Household added", $head_of_family);
aw_start_round($conn, intval($household_id), intval($_SESSION['user_id']));
$conn->commit();

http_response_code(201);
echo json_encode(["success" => true, "message" => "Household added.", "household_id" => $household_id]);

<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../utils/boundary_validator.php';
require_once __DIR__ . '/../lib/puroks.php';

require_login(['admin']);

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(["success" => false, "message" => "Method not allowed."]);
    exit();
}

$data = json_decode(file_get_contents("php://input"), true);

$head_of_family = trim($data['head_of_family'] ?? '');
$purok = trim($data['purok'] ?? '');
$address = trim($data['address'] ?? '');
$number_of_members = intval($data['number_of_members'] ?? 1);
$contact_number = trim($data['contact_number'] ?? '');
$latitude = $data['latitude'] !== '' && $data['latitude'] !== null ? floatval($data['latitude']) : null;
$longitude = $data['longitude'] !== '' && $data['longitude'] !== null ? floatval($data['longitude']) : null;
$user_id = !empty($data['user_id']) ? intval($data['user_id']) : null;

$children_count = max(0, intval($data['children_count'] ?? 0));
$seniors_count = max(0, intval($data['seniors_count'] ?? 0));
$pwd_count = max(0, intval($data['pwd_count'] ?? 0));
$pregnant_count = max(0, intval($data['pregnant_count'] ?? 0));
$medical_needs_count = max(0, intval($data['medical_needs_count'] ?? 0));
$other_vulnerable_count = max(0, intval($data['other_vulnerable_count'] ?? 0));
$vulnerable_members = $children_count + $seniors_count + $pwd_count + $pregnant_count + $medical_needs_count + $other_vulnerable_count;

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

http_response_code(201);
echo json_encode(["success" => true, "message" => "Household added.", "household_id" => $household_id]);

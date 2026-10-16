<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../utils/boundary_validator.php';
require_once __DIR__ . '/../lib/puroks.php';

require_login(['admin']);

if ($_SERVER['REQUEST_METHOD'] !== 'PUT' && $_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(["success" => false, "message" => "Method not allowed."]);
    exit();
}

$data = json_decode(file_get_contents("php://input"), true);
$household_id = intval($data['household_id'] ?? 0);

if ($household_id <= 0) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "We couldn't identify this household. Please refresh the page and try again."]);
    exit();
}

// Backend-authoritative boundary validation (Step 5) — same rule as
// add_household.php, checked before the UPDATE below so a rejected request
// never touches the database and the household's previous coordinates (if
// any) are left unchanged.
$coordCheck = validate_household_coordinates($data['latitude'] ?? null, $data['longitude'] ?? null);
if (!$coordCheck['valid']) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => $coordCheck['message']]);
    exit();
}

$children_count = max(0, intval($data['children_count'] ?? 0));
$seniors_count = max(0, intval($data['seniors_count'] ?? 0));
$pwd_count = max(0, intval($data['pwd_count'] ?? 0));
$pregnant_count = max(0, intval($data['pregnant_count'] ?? 0));
$medical_needs_count = max(0, intval($data['medical_needs_count'] ?? 0));
$other_vulnerable_count = max(0, intval($data['other_vulnerable_count'] ?? 0));
$vulnerable_members = $children_count + $seniors_count + $pwd_count + $pregnant_count + $medical_needs_count + $other_vulnerable_count;

$database = new Database();
$conn = $database->connect();

// Phase 19: purok must be a standard Binitayan purok. A household that still
// has an older, non-standard value may keep it unchanged (existing data is
// never rewritten automatically — use Purok Cleanup), but any NEW value must
// come from the standard list.
$submitted_purok = trim($data['purok'] ?? '');
$current_stmt = $conn->prepare("SELECT purok FROM households WHERE household_id = :household_id");
$current_stmt->execute([':household_id' => $household_id]);
$current_purok = $current_stmt->fetchColumn();
if ($current_purok === false) {
    http_response_code(404);
    echo json_encode(["success" => false, "message" => "Household not found. It may have been removed."]);
    exit();
}
$standard_purok = validate_purok_input($submitted_purok);
if ($standard_purok !== null) {
    $purok = $standard_purok;
} elseif ($submitted_purok !== '' && $submitted_purok === $current_purok) {
    $purok = $current_purok;
} else {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "Please select a valid purok (" . implode(', ', BINITAYAN_PUROKS) . ")."]);
    exit();
}

$stmt = $conn->prepare(
    "UPDATE households SET
        head_of_family = :head_of_family,
        purok = :purok,
        address = :address,
        number_of_members = :number_of_members,
        vulnerable_members = :vulnerable_members,
        children_count = :children_count,
        seniors_count = :seniors_count,
        pwd_count = :pwd_count,
        pregnant_count = :pregnant_count,
        medical_needs_count = :medical_needs_count,
        other_vulnerable_count = :other_vulnerable_count,
        contact_number = :contact_number,
        latitude = :latitude,
        longitude = :longitude,
        user_id = :user_id
     WHERE household_id = :household_id"
);

$stmt->execute([
    ':head_of_family' => trim($data['head_of_family'] ?? ''),
    ':purok' => $purok,
    ':address' => trim($data['address'] ?? ''),
    ':number_of_members' => intval($data['number_of_members'] ?? 1),
    ':vulnerable_members' => $vulnerable_members,
    ':children_count' => $children_count,
    ':seniors_count' => $seniors_count,
    ':pwd_count' => $pwd_count,
    ':pregnant_count' => $pregnant_count,
    ':medical_needs_count' => $medical_needs_count,
    ':other_vulnerable_count' => $other_vulnerable_count,
    ':contact_number' => trim($data['contact_number'] ?? ''),
    ':latitude' => $data['latitude'] !== '' && $data['latitude'] !== null ? floatval($data['latitude']) : null,
    ':longitude' => $data['longitude'] !== '' && $data['longitude'] !== null ? floatval($data['longitude']) : null,
    ':user_id' => !empty($data['user_id']) ? intval($data['user_id']) : null,
    ':household_id' => $household_id,
]);

log_action($conn, "Household updated", "household_id: $household_id");

echo json_encode(["success" => true, "message" => "Household updated."]);

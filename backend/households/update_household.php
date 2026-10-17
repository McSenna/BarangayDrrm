<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../utils/boundary_validator.php';
require_once __DIR__ . '/../lib/puroks.php';
require_once __DIR__ . '/../lib/household_counts.php';
require_once __DIR__ . '/../lib/household_profile.php';
require_once __DIR__ . '/../lib/allocation_views.php';

require_login(['admin']);

if ($_SERVER['REQUEST_METHOD'] !== 'PUT' && $_SERVER['REQUEST_METHOD'] !== 'POST') {
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

$database = new Database();
$conn = $database->connect();
$conn->beginTransaction();

// Phase 19: purok must be a standard Binitayan purok. A household that still
// has an older, non-standard value may keep it unchanged (existing data is
// never rewritten automatically — use Purok Cleanup), but any NEW value must
// come from the standard list.
$submitted_purok = trim($data['purok'] ?? '');
$current_stmt = $conn->prepare("SELECT * FROM households WHERE household_id = :household_id FOR UPDATE");
$current_stmt->execute([':household_id' => $household_id]);
$current_household = $current_stmt->fetch(PDO::FETCH_ASSOC);
if (!$current_household) {
    $conn->rollBack();
    http_response_code(404);
    echo json_encode(["success" => false, "message" => "Household not found. It may have been removed."]);
    exit();
}
$current_purok = $current_household['purok'];
$verified_profile = household_verified_profile($conn,$current_household);
// A household form cannot overwrite the totals attested from named members.
if ($verified_profile['complete']) $reported_counts = household_counts_from_verified_profile($verified_profile);
extract($reported_counts, EXTR_OVERWRITE);
$standard_purok = validate_purok_input($submitted_purok);
if ($standard_purok !== null) {
    $purok = $standard_purok;
} elseif ($submitted_purok !== '' && $submitted_purok === $current_purok) {
    $purok = $current_purok;
} else {
    $conn->rollBack();
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "Please select a valid purok (" . implode(', ', BINITAYAN_PUROKS) . ")."]);
    exit();
}

$stmt = $conn->prepare(
    "UPDATE households SET
        roster_verified_at = IF(head_of_family = :roster_head_name, roster_verified_at, NULL),
        roster_verified_by = IF(head_of_family = :roster_head_name_by, roster_verified_by, NULL),
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
    ':roster_head_name' => trim($data['head_of_family'] ?? ''),
    ':roster_head_name_by' => trim($data['head_of_family'] ?? ''),
    ':head_of_family' => trim($data['head_of_family'] ?? ''),
    ':purok' => $purok,
    ':address' => trim($data['address'] ?? ''),
    ':number_of_members' => $number_of_members,
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
$conn->commit();
av_promote_after_change($conn, intval($household_id), intval($_SESSION['user_id']));

echo json_encode(["success" => true, "message" => "Household updated."]);

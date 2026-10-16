<?php
require_once __DIR__ . '/../../config/cors.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../utils/boundary_validator.php';
require_once __DIR__ . '/../../lib/notify.php';

require_login(['admin']);

$data = json_decode(file_get_contents("php://input"), true);

$package_id = intval($data['package_id'] ?? 0);
$distribution_date = $data['distribution_date'] ?? '';
$distribution_time = !empty($data['distribution_time']) ? $data['distribution_time'] : null;
$location = trim($data['location'] ?? '');
$assigned_personnel = !empty($data['assigned_personnel']) ? intval($data['assigned_personnel']) : null;
$notes = trim($data['notes'] ?? '');
$household_ids = $data['household_ids'] ?? [];

if ($package_id <= 0 || $distribution_date === '' || $location === '') {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "Please select a relief package and enter the distribution date and location."]);
    exit();
}

if (!is_array($household_ids) || count($household_ids) === 0) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "Select at least one beneficiary household."]);
    exit();
}

// Phase 19: optional distribution-site coordinates for the map, validated
// against the official Binitayan boundary (same validator as households).
$coordCheck = validate_household_coordinates($data['latitude'] ?? null, $data['longitude'] ?? null);
if (!$coordCheck['valid']) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => $coordCheck['message']]);
    exit();
}
$latitude = isset($data['latitude']) && $data['latitude'] !== '' ? floatval($data['latitude']) : null;
$longitude = isset($data['longitude']) && $data['longitude'] !== '' ? floatval($data['longitude']) : null;

$database = new Database();
$conn = $database->connect();

try {
    $conn->beginTransaction();

    $stmt = $conn->prepare(
        "INSERT INTO distribution_schedules (package_id, distribution_date, distribution_time, location, latitude, longitude, assigned_personnel, notes, created_by)
         VALUES (:package_id, :distribution_date, :distribution_time, :location, :latitude, :longitude, :assigned_personnel, :notes, :created_by)"
    );
    $stmt->execute([
        ':package_id' => $package_id,
        ':distribution_date' => $distribution_date,
        ':distribution_time' => $distribution_time,
        ':location' => $location,
        ':latitude' => $latitude,
        ':longitude' => $longitude,
        ':assigned_personnel' => $assigned_personnel,
        ':notes' => $notes,
        ':created_by' => $_SESSION['user_id'],
    ]);
    $schedule_id = $conn->lastInsertId();

    $ben_stmt = $conn->prepare(
        "INSERT INTO distribution_beneficiaries (schedule_id, household_id) VALUES (:schedule_id, :household_id)"
    );
    foreach (array_unique($household_ids) as $household_id) {
        $household_id = intval($household_id);
        if ($household_id <= 0) continue;
        $ben_stmt->execute([':schedule_id' => $schedule_id, ':household_id' => $household_id]);
    }

    $conn->commit();

    log_action($conn, "Distribution schedule created", "schedule_id: $schedule_id, beneficiaries: " . count($household_ids));

    // Phase 19 — after COMMIT: tell each beneficiary household (in-app + SMS)
    // and the assigned relief personnel (in-app). Never affects the result.
    $when = trim($distribution_date . ' ' . ($distribution_time ? substr($distribution_time, 0, 5) : ''));
    $targets = array_map(fn($id) => ['household_id' => intval($id)], array_filter(array_unique($household_ids), fn($id) => intval($id) > 0));
    $summary = dispatch_notification($conn, $targets, "schedule:$schedule_id:scheduled", "Relief distribution scheduled",
        "Your household is scheduled to receive relief on $when at $location. Please bring a valid ID.",
        ['link' => '/resident/relief-status', 'sms' => true, 'sms_category' => 'Distribution Schedule', 'sent_by' => $_SESSION['user_id'], 'event_type' => 'DISTRIBUTION_SCHEDULED']);
    if ($assigned_personnel) {
        dispatch_notification($conn, [['user_id' => $assigned_personnel]], "schedule:$schedule_id:assigned:$assigned_personnel",
            "New distribution assignment", "You are assigned to the relief distribution on $when at $location.",
            ['link' => "/personnel/schedules/$schedule_id", 'sms' => false]);
    }

    http_response_code(201);
    echo json_encode(["success" => true, "message" => "Distribution schedule created." . (describe_sms_result($summary) ? " " . describe_sms_result($summary) : ""), "schedule_id" => $schedule_id]);
} catch (Exception $e) {
    $conn->rollBack();
    http_response_code(500);
    error_log("relief/schedules/add_schedule.php: " . $e->getMessage());
    echo json_encode(["success" => false, "message" => "We couldn't create the distribution schedule. Please try again."]);
}

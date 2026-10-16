<?php
require_once __DIR__ . '/../../config/cors.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../utils/boundary_validator.php';
require_once __DIR__ . '/../../lib/notify.php';

require_login(['admin']);

$data = json_decode(file_get_contents("php://input"), true);
$schedule_id = intval($data['schedule_id'] ?? 0);

if ($schedule_id <= 0) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "The schedule could not be found. Please refresh the page and try again."]);
    exit();
}

$distribution_date = $data['distribution_date'] ?? '';
$location = trim($data['location'] ?? '');

if ($distribution_date === '' || $location === '') {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "Distribution date and location are required."]);
    exit();
}

// Phase 19: optional site coordinates. Only changed when the request includes
// them, so an older form that does not send coordinates never erases them.
$coords_sent = array_key_exists('latitude', $data) || array_key_exists('longitude', $data);
if ($coords_sent) {
    $coordCheck = validate_household_coordinates($data['latitude'] ?? null, $data['longitude'] ?? null);
    if (!$coordCheck['valid']) {
        http_response_code(400);
        echo json_encode(["success" => false, "message" => $coordCheck['message']]);
        exit();
    }
}

$database = new Database();
$conn = $database->connect();

$before_stmt = $conn->prepare("SELECT distribution_date, distribution_time, location, assigned_personnel, latitude, longitude FROM distribution_schedules WHERE schedule_id = :id");
$before_stmt->execute([':id' => $schedule_id]);
$before = $before_stmt->fetch(PDO::FETCH_ASSOC);
if (!$before) {
    http_response_code(404);
    echo json_encode(["success" => false, "message" => "The schedule could not be found. Please refresh the page and try again."]);
    exit();
}

$new_time = !empty($data['distribution_time']) ? $data['distribution_time'] : null;
$new_personnel = !empty($data['assigned_personnel']) ? intval($data['assigned_personnel']) : null;
$latitude = $coords_sent ? (($data['latitude'] ?? '') !== '' && $data['latitude'] !== null ? floatval($data['latitude']) : null) : $before['latitude'];
$longitude = $coords_sent ? (($data['longitude'] ?? '') !== '' && $data['longitude'] !== null ? floatval($data['longitude']) : null) : $before['longitude'];

$stmt = $conn->prepare(
    "UPDATE distribution_schedules SET
        distribution_date = :distribution_date,
        distribution_time = :distribution_time,
        location = :location,
        latitude = :latitude,
        longitude = :longitude,
        assigned_personnel = :assigned_personnel,
        notes = :notes
     WHERE schedule_id = :schedule_id"
);
$stmt->execute([
    ':distribution_date' => $distribution_date,
    ':distribution_time' => $new_time,
    ':location' => $location,
    ':latitude' => $latitude,
    ':longitude' => $longitude,
    ':assigned_personnel' => $new_personnel,
    ':notes' => trim($data['notes'] ?? ''),
    ':schedule_id' => $schedule_id,
]);

log_action($conn, "Distribution schedule updated", "schedule_id: $schedule_id");

// Phase 19 — after the update: if the date, time or place changed, tell every
// non-cancelled beneficiary household (in-app + SMS). The event key includes
// the new details, so saving the same change again sends nothing new.
$norm_time = fn($t) => $t ? substr((string) $t, 0, 5) : '';
$changed = $before['distribution_date'] !== $distribution_date
    || $norm_time($before['distribution_time']) !== $norm_time($new_time)
    || trim((string) $before['location']) !== $location;
$extra = '';
if ($changed) {
    $ben = $conn->prepare("SELECT household_id FROM distribution_beneficiaries WHERE schedule_id = :id AND status NOT IN ('Delivered','Cancelled')");
    $ben->execute([':id' => $schedule_id]);
    $targets = array_map(fn($id) => ['household_id' => intval($id)], $ben->fetchAll(PDO::FETCH_COLUMN));
    $when = trim($distribution_date . ' ' . $norm_time($new_time));
    $key = "schedule:$schedule_id:changed:" . substr(md5("$distribution_date|" . $norm_time($new_time) . "|$location"), 0, 12);
    $summary = dispatch_notification($conn, $targets, $key, "Relief distribution schedule changed",
        "The relief distribution for your household has been moved to $when at $location.",
        ['link' => '/resident/relief-status', 'sms' => true, 'sms_category' => 'Distribution Schedule Change', 'sent_by' => $_SESSION['user_id'], 'event_type' => 'DISTRIBUTION_SCHEDULE_CHANGED']);
    $extra = " Beneficiaries were notified of the change." . (describe_sms_result($summary) ? " " . describe_sms_result($summary) : "");
}
if ($new_personnel && intval($before['assigned_personnel']) !== $new_personnel) {
    dispatch_notification($conn, [['user_id' => $new_personnel]], "schedule:$schedule_id:assigned:$new_personnel",
        "New distribution assignment", "You are assigned to the relief distribution on " . trim($distribution_date . ' ' . $norm_time($new_time)) . " at $location.",
        ['link' => "/personnel/schedules/$schedule_id", 'sms' => false]);
}

echo json_encode(["success" => true, "message" => "Schedule updated." . $extra]);

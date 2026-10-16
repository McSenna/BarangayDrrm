<?php
require_once __DIR__ . '/../../config/cors.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../lib/notify.php';

require_login(['admin']);

$data = json_decode(file_get_contents("php://input"), true);
$schedule_id = intval($data['schedule_id'] ?? 0);
$household_id = intval($data['household_id'] ?? 0);

if ($schedule_id <= 0 || $household_id <= 0) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "Please select a household to add."]);
    exit();
}

$database = new Database();
$conn = $database->connect();

$check = $conn->prepare("SELECT beneficiary_id FROM distribution_beneficiaries WHERE schedule_id = :schedule_id AND household_id = :household_id");
$check->execute([':schedule_id' => $schedule_id, ':household_id' => $household_id]);
if ($check->fetch()) {
    http_response_code(409);
    echo json_encode(["success" => false, "message" => "This household is already a beneficiary of this schedule."]);
    exit();
}

$stmt = $conn->prepare("INSERT INTO distribution_beneficiaries (schedule_id, household_id) VALUES (:schedule_id, :household_id)");
$stmt->execute([':schedule_id' => $schedule_id, ':household_id' => $household_id]);

// Phase 17 fix: capture the new beneficiary row's ID before log_action()
// inserts into audit_logs (see disasters/create_report.php for the same bug pattern).
$beneficiary_id = $conn->lastInsertId();

log_action($conn, "Beneficiary added to schedule", "schedule_id: $schedule_id, household_id: $household_id");

// Phase 19: tell the household it is scheduled (in-app + SMS), same event as schedule creation.
$sch = $conn->prepare("SELECT distribution_date, distribution_time, location FROM distribution_schedules WHERE schedule_id = :id");
$sch->execute([':id' => $schedule_id]);
$schedule = $sch->fetch(PDO::FETCH_ASSOC);
$sms_note = '';
if ($schedule) {
    $when = trim($schedule['distribution_date'] . ' ' . ($schedule['distribution_time'] ? substr($schedule['distribution_time'], 0, 5) : ''));
    $summary = dispatch_notification($conn, [['household_id' => $household_id]], "schedule:$schedule_id:scheduled", "Relief distribution scheduled",
        "Your household is scheduled to receive relief on $when at {$schedule['location']}. Please bring a valid ID.",
        ['link' => '/resident/relief-status', 'sms' => true, 'sms_category' => 'Distribution Schedule', 'sent_by' => $_SESSION['user_id'], 'event_type' => 'DISTRIBUTION_SCHEDULED']);
    $sms_note = describe_sms_result($summary) ? " " . describe_sms_result($summary) : "";
}

http_response_code(201);
echo json_encode(["success" => true, "message" => "Household added as a beneficiary." . $sms_note, "beneficiary_id" => $beneficiary_id]);

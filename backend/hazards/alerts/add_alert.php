<?php
require_once __DIR__ . '/../../config/cors.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../lib/puroks.php';

require_login(['admin']);

$data = json_decode(file_get_contents("php://input"), true);

$hazard_type = $data['hazard_type'] ?? '';
$status = $data['status'] ?? 'Alert';
$title = trim($data['title'] ?? '');
$description = trim($data['description'] ?? '');
$affected_purok = trim($data['affected_purok'] ?? '');

$valid_types = ['Flood', 'Typhoon', 'Landslide', 'General Emergency'];
$valid_status = ['Normal', 'Alert', 'Warning', 'Critical'];

if (!in_array($hazard_type, $valid_types) || $title === '') {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "Please select a hazard type and enter a title."]);
    exit();
}
if (!in_array($status, $valid_status)) {
    $status = 'Alert';
}
// Phase 19: a purok-specific alert must name a standard purok so the DSS
// location factor matches households in that purok. Empty = barangay-wide.
if ($affected_purok !== '') {
    $standard_purok = validate_purok_input($affected_purok);
    if ($standard_purok === null) {
        http_response_code(400);
        echo json_encode(["success" => false, "message" => "Please select a valid purok, or leave it empty for a barangay-wide alert."]);
        exit();
    }
    $affected_purok = $standard_purok;
}

$database = new Database();
$conn = $database->connect();

$stmt = $conn->prepare(
    "INSERT INTO hazard_alerts (hazard_type, status, title, description, affected_purok, is_active, issued_by, issued_at)
     VALUES (:hazard_type, :status, :title, :description, :affected_purok, 1, :issued_by, NOW())"
);

$stmt->execute([
    ':hazard_type' => $hazard_type,
    ':status' => $status,
    ':title' => $title,
    ':description' => $description,
    ':affected_purok' => $affected_purok !== '' ? $affected_purok : null,
    ':issued_by' => $_SESSION['user_id'],
]);

// Phase 17 fix: capture the new alert's ID before log_action() inserts into
// audit_logs (see disasters/create_report.php for the same bug pattern).
$alert_id = $conn->lastInsertId();

log_action($conn, "Hazard alert issued", "$hazard_type - $title ($status)");

http_response_code(201);
echo json_encode(["success" => true, "message" => "Hazard alert issued.", "alert_id" => $alert_id]);

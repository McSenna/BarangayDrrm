<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';

require_login(['admin']);

$data = json_decode(file_get_contents("php://input"), true);

if (!is_array($data) || empty($data)) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "There are no changes to save."]);
    exit();
}

// Whitelist of editable keys — prevents arbitrary keys being inserted into
// system_settings from a crafted request.
$allowed_keys = [
    'barangay_name', 'system_name', 'barangay_address', 'office_hours',
    'contact_email', 'contact_phone', 'emergency_hotline',
    'default_minimum_level', 'default_unit',
    // Public landing page advisories (one step per line): shown to residents
    // for a Critical alert, a Warning/Alert, and when the status is Normal.
    'public_advisory_steps', 'public_advisory_steps_warning', 'public_preparedness_tips',
];

$database = new Database();
$conn = $database->connect();

$stmt = $conn->prepare(
    "INSERT INTO system_settings (setting_key, setting_value, updated_by)
     VALUES (:setting_key, :setting_value, :updated_by)
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_by = VALUES(updated_by)"
);

$updated = [];
foreach ($data as $key => $value) {
    if (!in_array($key, $allowed_keys)) {
        continue; // silently skip unknown keys rather than erroring the whole batch
    }
    $stmt->execute([
        ':setting_key' => $key,
        ':setting_value' => trim((string) $value),
        ':updated_by' => $_SESSION['user_id'],
    ]);
    $updated[] = $key;
}

if (empty($updated)) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "The settings could not be saved. Please refresh the page and try again."]);
    exit();
}

log_action($conn, "System settings updated", implode(', ', $updated));

echo json_encode(["success" => true, "message" => "Settings updated.", "updated" => $updated]);

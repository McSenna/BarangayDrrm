<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/sms_helper.php';

require_login(['admin']);

$data = json_decode(file_get_contents("php://input"), true);

$recipient_mode = $data['recipient_mode'] ?? ''; // 'resident' | 'personnel' | 'household' | 'custom'
$message = trim($data['message'] ?? '');
$category = $data['category'] ?? 'General';

$valid_categories = [
    'Emergency Warning', 'Disaster Alert', 'Evacuation Warning', 'Relief Distribution Announcement',
    'Distribution Schedule', 'Beneficiary Notification', 'Relief Availability', 'General',
];
if (!in_array($category, $valid_categories)) {
    $category = 'General';
}

if ($message === '') {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "Message text is required."]);
    exit();
}

$database = new Database();
$conn = $database->connect();

$recipients = [];

if ($recipient_mode === 'resident') {
    $ids = $data['user_ids'] ?? [];
    if (!is_array($ids) || count($ids) === 0) {
        http_response_code(400);
        echo json_encode(["success" => false, "message" => "Select at least one resident."]);
        exit();
    }
    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $stmt = $conn->prepare("SELECT full_name, contact_number FROM users WHERE role = 'resident' AND user_id IN ($placeholders) AND contact_number IS NOT NULL AND contact_number != ''");
    $stmt->execute(array_map('intval', $ids));
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $recipients[] = ['type' => 'Resident', 'name' => $row['full_name'], 'number' => $row['contact_number']];
    }
} elseif ($recipient_mode === 'personnel') {
    $ids = $data['user_ids'] ?? [];
    if (!is_array($ids) || count($ids) === 0) {
        http_response_code(400);
        echo json_encode(["success" => false, "message" => "Select at least one relief personnel."]);
        exit();
    }
    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $stmt = $conn->prepare("SELECT full_name, contact_number FROM users WHERE role = 'relief_personnel' AND user_id IN ($placeholders) AND contact_number IS NOT NULL AND contact_number != ''");
    $stmt->execute(array_map('intval', $ids));
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $recipients[] = ['type' => 'Relief Personnel', 'name' => $row['full_name'], 'number' => $row['contact_number']];
    }
} elseif ($recipient_mode === 'household') {
    $ids = $data['household_ids'] ?? [];
    if (!is_array($ids) || count($ids) === 0) {
        http_response_code(400);
        echo json_encode(["success" => false, "message" => "Select at least one household."]);
        exit();
    }
    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $stmt = $conn->prepare("SELECT head_of_family, contact_number FROM households WHERE household_id IN ($placeholders) AND contact_number IS NOT NULL AND contact_number != ''");
    $stmt->execute(array_map('intval', $ids));
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $recipients[] = ['type' => 'Household', 'name' => $row['head_of_family'], 'number' => $row['contact_number']];
    }
} elseif ($recipient_mode === 'custom') {
    $custom = $data['custom_recipients'] ?? [];
    if (!is_array($custom) || count($custom) === 0) {
        http_response_code(400);
        echo json_encode(["success" => false, "message" => "Please enter at least one phone number."]);
        exit();
    }
    foreach ($custom as $c) {
        $number = trim($c['number'] ?? '');
        if ($number === '') continue;
        $recipients[] = ['type' => 'Custom', 'name' => trim($c['name'] ?? '') ?: null, 'number' => $number];
    }
} else {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "Please choose a recipient type."]);
    exit();
}

if (empty($recipients)) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "None of the selected recipients has a contact number on file. Please update their contact numbers and try again."]);
    exit();
}

$result = send_sms_batch($conn, $recipients, $message, $category, $_SESSION['user_id']);

log_action($conn, "SMS sent", "mode: $recipient_mode, category: $category, recipients: " . count($recipients) . ", result: " . ($result['success'] ? 'sent' : 'failed/not configured'));

echo json_encode($result);

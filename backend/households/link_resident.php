<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';

require_login(['admin']);

$data = json_decode(file_get_contents("php://input"), true);
$household_id = intval($data['household_id'] ?? 0);
$raw_user_id = $data['user_id'] ?? null;
$user_id = ($raw_user_id !== null && $raw_user_id !== '') ? intval($raw_user_id) : null;

if ($household_id <= 0) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "We couldn't identify this household. Please refresh the page and try again."]);
    exit();
}

$database = new Database();
$conn = $database->connect();

if ($user_id !== null) {
    // Confirm the target user exists and is a resident
    $check = $conn->prepare("SELECT user_id FROM users WHERE user_id = :user_id AND role = 'resident'");
    $check->execute([':user_id' => $user_id]);
    if (!$check->fetch()) {
        http_response_code(404);
        echo json_encode(["success" => false, "message" => "Resident account not found."]);
        exit();
    }

    // Prevent linking one resident to two households
    $dupe = $conn->prepare("SELECT household_id FROM households WHERE user_id = :user_id AND household_id != :household_id");
    $dupe->execute([':user_id' => $user_id, ':household_id' => $household_id]);
    if ($dupe->fetch()) {
        http_response_code(409);
        echo json_encode(["success" => false, "message" => "This resident is already linked to another household."]);
        exit();
    }
}

$stmt = $conn->prepare("UPDATE households SET user_id = :user_id WHERE household_id = :household_id");
$stmt->execute([':user_id' => $user_id, ':household_id' => $household_id]);

log_action($conn, $user_id ? "Household linked to resident" : "Household unlinked", "household_id: $household_id, user_id: " . ($user_id ?? 'none'));

echo json_encode(["success" => true, "message" => $user_id ? "Household linked to resident account." : "Household unlinked."]);

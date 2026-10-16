<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';

require_login(); // any logged-in role — editing only their OWN account

$data = json_decode(file_get_contents("php://input"), true);

$full_name = trim($data['full_name'] ?? '');
$email = trim($data['email'] ?? '');
$contact_number = trim($data['contact_number'] ?? '');

if ($full_name === '' || $email === '') {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "Full name and email are required."]);
    exit();
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "Please enter a valid email address."]);
    exit();
}

$database = new Database();
$conn = $database->connect();

$user_id = $_SESSION['user_id'];

// Phase 21 — residents may update ONLY their contact number here (and their
// password through change_my_password.php). Name and email are registered
// account details managed by the barangay office, so a resident request that
// tries to change them is refused; household and assessment data are never
// editable from a resident account.
if ($_SESSION['role'] === 'resident') {
    require_once __DIR__ . '/../sms/sms_helper.php';
    $cur = $conn->prepare("SELECT full_name, email FROM users WHERE user_id = :user_id");
    $cur->execute([':user_id' => $user_id]);
    $current = $cur->fetch(PDO::FETCH_ASSOC);
    if (!$current) {
        http_response_code(404);
        echo json_encode(["success" => false, "message" => "Your account could not be found."]);
        exit();
    }
    if ($full_name !== $current['full_name'] || strcasecmp($email, $current['email']) !== 0) {
        http_response_code(403);
        echo json_encode(["success" => false, "message" => "Your name and email address are managed by the barangay office. You can update your contact number and password only."]);
        exit();
    }
    if ($contact_number !== '' && !sms_is_valid_ph_mobile($contact_number)) {
        http_response_code(400);
        echo json_encode(["success" => false, "message" => "Please enter a valid Philippine mobile number, for example 09171234567."]);
        exit();
    }
    $full_name = $current['full_name'];
    $email = $current['email'];
}

// Make sure the email isn't already used by a DIFFERENT user
$check = $conn->prepare("SELECT user_id FROM users WHERE email = :email AND user_id != :user_id");
$check->execute([':email' => $email, ':user_id' => $user_id]);
if ($check->fetch()) {
    http_response_code(409);
    echo json_encode(["success" => false, "message" => "This email address is already used by another account. Please use a different email address."]);
    exit();
}

$stmt = $conn->prepare(
    "UPDATE users SET full_name = :full_name, email = :email, contact_number = :contact_number WHERE user_id = :user_id"
);
$stmt->execute([
    ':full_name' => $full_name,
    ':email' => $email,
    ':contact_number' => $contact_number,
    ':user_id' => $user_id,
]);

// Keep the session in sync so the navbar/sidebar reflect the change immediately
$_SESSION['full_name'] = $full_name;
$_SESSION['email'] = $email;

log_action($conn, "Profile updated", "user_id: $user_id");

echo json_encode([
    "success" => true,
    "message" => "Your profile has been updated.",
    "user" => [
        "user_id" => $user_id,
        "full_name" => $full_name,
        "email" => $email,
        "role" => $_SESSION['role'],
        "contact_number" => $contact_number,
    ],
]);

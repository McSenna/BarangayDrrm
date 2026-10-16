<?php

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../lib/requests.php';
require_once __DIR__ . '/../lib/feedback.php';

resident_function_disabled('Submitting relief feedback'); 

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(["success" => false, "message" => "Method not allowed."]);
    exit();
}

$data = json_decode(file_get_contents("php://input"), true);
if (!is_array($data)) $data = [];

$type = $data['type'] ?? '';
$ref_id = intval($data['ref_id'] ?? 0);
$received = $data['received'] ?? '';
$rating = $data['rating'] ?? null;
$sufficiency = $data['sufficiency'] ?? '';
$experience = $data['experience'] ?? '';
$comments = trim((string) ($data['comments'] ?? ''));

if (!in_array($type, ['schedule', 'request', 'allocation'], true) || $ref_id <= 0) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "Please choose the delivery you are giving feedback on."]);
    exit();
}
if (!in_array($received, ['Yes', 'No'], true)
    || !is_numeric($rating) || intval($rating) != $rating || intval($rating) < 1 || intval($rating) > 5
    || !in_array($sufficiency, ['Sufficient', 'Partially Sufficient', 'Insufficient'], true)
    || !in_array($experience, ['Excellent', 'Good', 'Fair', 'Poor'], true)) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "Please answer every question (received, rating 1–5, sufficiency and experience)."]);
    exit();
}
if (mb_strlen($comments) > 2000) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "Comments must be 2,000 characters or fewer."]);
    exit();
}
$rating = intval($rating);

$database = new Database();
$conn = $database->connect();
$user_id = intval($_SESSION['user_id']);
$household = resident_household($conn, $user_id);
if (!$household) {
    http_response_code(409);
    echo json_encode(["success" => false, "message" => "Your account is not linked to a household, so feedback cannot be recorded."]);
    exit();
}
$household_id = intval($household['household_id']);

if (!feedback_delivery_is_valid($conn, $type, $ref_id, $household_id)) {
    http_response_code(409);
    echo json_encode(["success" => false, "message" => "Feedback can only be given for relief that has been delivered to your household."]);
    exit();
}

$is_complaint = ($received === 'No' || $rating <= 2 || $sufficiency === 'Insufficient' || $experience === 'Poor') ? 1 : 0;

try {
    $stmt = $conn->prepare(
        "INSERT INTO relief_feedback (household_id, user_id, beneficiary_id, request_id, allocation_id, received, rating, sufficiency, experience, comments, is_complaint)
         VALUES (:household_id, :user_id, :beneficiary_id, :request_id, :allocation_id, :received, :rating, :sufficiency, :experience, :comments, :is_complaint)"
    );
    $stmt->execute([
        ':household_id' => $household_id,
        ':user_id' => $user_id,
        ':beneficiary_id' => $type === 'schedule' ? $ref_id : null,
        ':request_id' => $type === 'request' ? $ref_id : null,
        ':allocation_id' => $type === 'allocation' ? $ref_id : null,
        ':received' => $received,
        ':rating' => $rating,
        ':sufficiency' => $sufficiency,
        ':experience' => $experience,
        ':comments' => $comments !== '' ? $comments : null,
        ':is_complaint' => $is_complaint,
    ]);
    $feedback_id = intval($conn->lastInsertId());
} catch (PDOException $e) {
    if ($e->getCode() === '23000') {
        http_response_code(409);
        echo json_encode(["success" => false, "message" => "Feedback has already been submitted for this delivery."]);
        exit();
    }
    http_response_code(500);
    error_log("feedback/submit_feedback.php: " . $e->getMessage());
    echo json_encode(["success" => false, "message" => "We couldn't save your feedback. Please try again."]);
    exit();
}

log_action($conn, "Relief feedback submitted", "feedback_id: $feedback_id, $type #$ref_id, rating: $rating" . ($is_complaint ? ", flagged as complaint" : ""));

http_response_code(201);
echo json_encode(["success" => true, "message" => "Thank you. Your feedback has been sent to the Barangay Administrator.", "feedback_id" => $feedback_id]);

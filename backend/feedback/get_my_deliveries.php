<?php
/**
 * Resident: delivered relief for their own household and whether feedback
 * has been given for each delivery (Phase 19). Household from the session.
 */
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../lib/requests.php';
require_once __DIR__ . '/../lib/feedback.php';

resident_function_disabled('Relief feedback'); // Phase 21: residents no longer use this function

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(["success" => false, "message" => "Method not allowed."]);
    exit();
}

$database = new Database();
$conn = $database->connect();
$household = resident_household($conn, intval($_SESSION['user_id']));
if (!$household) {
    echo json_encode(["success" => true, "household_linked" => false, "data" => [], "feedback" => []]);
    exit();
}

$deliveries = feedback_deliveries_for_household($conn, intval($household['household_id']));

$f = $conn->prepare("SELECT feedback_id, beneficiary_id, request_id, allocation_id, received, rating, sufficiency, experience, comments, created_at
                     FROM relief_feedback WHERE household_id = :id ORDER BY created_at DESC");
$f->execute([':id' => $household['household_id']]);

echo json_encode([
    "success" => true,
    "household_linked" => true,
    "data" => $deliveries,
    "feedback" => $f->fetchAll(PDO::FETCH_ASSOC),
]);

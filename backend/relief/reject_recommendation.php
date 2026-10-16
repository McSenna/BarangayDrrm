<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';

require_login(['admin']);

$data = json_decode(file_get_contents("php://input"), true);
$household_id = intval($data['household_id'] ?? 0);
$item_id = intval($data['item_id'] ?? 0);
$reason = trim($data['reason'] ?? '');

if ($household_id <= 0 || $item_id <= 0) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "The household or relief item is missing. Please refresh the page and try again."]);
    exit();
}

$database = new Database();
$conn = $database->connect();

// Recommendations are computed, not stored, so the Administrator's rejection is
// recorded in relief_recommendation_rejections (Phase 18). The pair is then
// skipped by relief_recommendations.php until the Administrator restores it.
// No allocation is created and no stock is affected.
$check = $conn->prepare(
    "SELECT (SELECT COUNT(*) FROM households WHERE household_id = :household_id) AS h,
            (SELECT COUNT(*) FROM relief_items WHERE item_id = :item_id) AS i"
);
$check->execute([':household_id' => $household_id, ':item_id' => $item_id]);
$exists = $check->fetch(PDO::FETCH_ASSOC);
if (!$exists || intval($exists['h']) === 0 || intval($exists['i']) === 0) {
    http_response_code(404);
    echo json_encode(["success" => false, "message" => "The household or relief item could not be found. Please refresh the page and try again."]);
    exit();
}

try {
    $stmt = $conn->prepare(
        "INSERT INTO relief_recommendation_rejections (household_id, item_id, reason, rejected_by)
         VALUES (:household_id, :item_id, :reason, :rejected_by)
         ON DUPLICATE KEY UPDATE reason = VALUES(reason), rejected_by = VALUES(rejected_by), rejected_at = CURRENT_TIMESTAMP"
    );
    $stmt->execute([
        ':household_id' => $household_id,
        ':item_id' => $item_id,
        ':reason' => $reason !== '' ? (function_exists('mb_substr') ? mb_substr($reason, 0, 255) : substr($reason, 0, 255)) : null,
        ':rejected_by' => $_SESSION['user_id'] ?? null,
    ]);
} catch (PDOException $e) {
    error_log("relief/reject_recommendation.php: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(["success" => false, "message" => "The rejection could not be saved. Please try again. If the problem continues, ask the system administrator to apply the latest database update."]);
    exit();
}

log_action($conn, "Relief recommendation rejected", "household_id: $household_id, item_id: $item_id" . ($reason ? ", reason: $reason" : ""));

echo json_encode(["success" => true, "message" => "Recommendation rejected. It will stay in Rejected Recommendations until it is restored."]);

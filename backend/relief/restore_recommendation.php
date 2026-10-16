<?php
/**
 * Restore a relief recommendation that the Administrator previously rejected
 * (Phase 18). Deleting the rejection record lets relief_recommendations.php
 * compute the recommendation again. No allocation or stock is changed here.
 */
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';

require_login(['admin']);

$data = json_decode(file_get_contents("php://input"), true);
$household_id = intval($data['household_id'] ?? 0);
$item_id = intval($data['item_id'] ?? 0);

if ($household_id <= 0 || $item_id <= 0) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "The household or relief item is missing. Please refresh the page and try again."]);
    exit();
}

$database = new Database();
$conn = $database->connect();

try {
    $stmt = $conn->prepare("DELETE FROM relief_recommendation_rejections WHERE household_id = :household_id AND item_id = :item_id");
    $stmt->execute([':household_id' => $household_id, ':item_id' => $item_id]);
} catch (PDOException $e) {
    error_log("relief/restore_recommendation.php: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(["success" => false, "message" => "The recommendation could not be restored. Please try again."]);
    exit();
}

if ($stmt->rowCount() === 0) {
    http_response_code(404);
    echo json_encode(["success" => false, "message" => "This recommendation is no longer marked as rejected. Please refresh the page."]);
    exit();
}

log_action($conn, "Relief recommendation restored", "household_id: $household_id, item_id: $item_id");

echo json_encode(["success" => true, "message" => "Recommendation restored. It will appear again in Relief Recommendations if the household still needs this item."]);

<?php
/** Admin: occupancy and status history of one evacuation center (Phase 19). */
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';

require_login(['admin']);

$center_id = intval($_GET['center_id'] ?? 0);
if ($center_id <= 0) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "Evacuation center not specified."]);
    exit();
}
$database = new Database();
$conn = $database->connect();
$stmt = $conn->prepare(
    "SELECT l.*, u.full_name AS changed_by_name FROM evacuation_center_logs l
     LEFT JOIN users u ON u.user_id = l.changed_by
     WHERE l.center_id = :id ORDER BY l.changed_at DESC, l.log_id DESC LIMIT 200"
);
$stmt->execute([':id' => $center_id]);
echo json_encode(["success" => true, "data" => $stmt->fetchAll(PDO::FETCH_ASSOC)]);

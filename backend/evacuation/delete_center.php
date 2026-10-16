<?php
/** Admin: delete an evacuation center and its occupancy history (Phase 19). Not allowed while it has evacuees. */
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';

require_login(['admin']);

if (!in_array($_SERVER['REQUEST_METHOD'], ['DELETE', 'POST'], true)) {
    http_response_code(405);
    echo json_encode(["success" => false, "message" => "Method not allowed."]);
    exit();
}

$data = json_decode(file_get_contents("php://input"), true);
$center_id = intval($data['center_id'] ?? 0);
if ($center_id <= 0) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "Evacuation center not specified."]);
    exit();
}

$database = new Database();
$conn = $database->connect();
$cur = $conn->prepare("SELECT name, current_occupancy FROM evacuation_centers WHERE center_id = :id");
$cur->execute([':id' => $center_id]);
$c = $cur->fetch(PDO::FETCH_ASSOC);
if (!$c) {
    http_response_code(404);
    echo json_encode(["success" => false, "message" => "Evacuation center not found."]);
    exit();
}
if (intval($c['current_occupancy']) > 0) {
    http_response_code(409);
    echo json_encode(["success" => false, "message" => "This center still has evacuees. Set the occupancy to 0 before deleting it."]);
    exit();
}
$conn->prepare("DELETE FROM evacuation_centers WHERE center_id = :id")->execute([':id' => $center_id]);
log_action($conn, "Evacuation center deleted", "center_id: $center_id ({$c['name']})");
echo json_encode(["success" => true, "message" => "Evacuation center deleted."]);

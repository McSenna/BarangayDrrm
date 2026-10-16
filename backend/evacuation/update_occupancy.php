<?php
/**
 * Admin: update an evacuation center's current occupancy (Phase 19).
 * Occupancy must be 0..capacity. Open <-> Full switches automatically.
 * Every change is logged.
 */
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../lib/evacuation.php';

require_login(['admin']);

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(["success" => false, "message" => "Method not allowed."]);
    exit();
}

$data = json_decode(file_get_contents("php://input"), true);
$center_id = intval($data['center_id'] ?? 0);
$occ = $data['current_occupancy'] ?? null;
$remarks = trim((string) ($data['remarks'] ?? ''));
if ($center_id <= 0 || !is_numeric($occ) || intval($occ) != $occ || intval($occ) < 0) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "Occupancy must be a whole number of 0 or more."]);
    exit();
}
$occ = intval($occ);

$database = new Database();
$conn = $database->connect();

try {
    $conn->beginTransaction();
    $cur = $conn->prepare("SELECT name, capacity, current_occupancy, status FROM evacuation_centers WHERE center_id = :id FOR UPDATE");
    $cur->execute([':id' => $center_id]);
    $c = $cur->fetch(PDO::FETCH_ASSOC);
    if (!$c) {
        $conn->rollBack();
        http_response_code(404);
        echo json_encode(["success" => false, "message" => "Evacuation center not found."]);
        exit();
    }
    $capacity = intval($c['capacity']);
    if ($occ > $capacity) {
        $conn->rollBack();
        http_response_code(400);
        echo json_encode(["success" => false, "message" => "Occupancy cannot exceed the center's capacity ($capacity)."]);
        exit();
    }
    if ($c['status'] === 'Closed' && $occ > 0) {
        $conn->rollBack();
        http_response_code(409);
        echo json_encode(["success" => false, "message" => "This center is Closed. Open it before recording evacuees."]);
        exit();
    }
    $new_status = evac_effective_status($c['status'], $occ, $capacity);
    $conn->prepare("UPDATE evacuation_centers SET current_occupancy = :occ, status = :status, updated_by = :admin WHERE center_id = :id")
        ->execute([':occ' => $occ, ':status' => $new_status, ':admin' => $_SESSION['user_id'], ':id' => $center_id]);
    evac_log_change($conn, $center_id, intval($c['current_occupancy']), $occ, $c['status'], $new_status, $remarks);
    log_action($conn, "Evacuation center occupancy updated", "center_id: $center_id ({$c['name']}): {$c['current_occupancy']} -> $occ of $capacity" . ($new_status !== $c['status'] ? ", status: $new_status" : ""));
    $conn->commit();
} catch (Exception $e) {
    if ($conn->inTransaction()) $conn->rollBack();
    http_response_code(500);
    error_log("evacuation/update_occupancy.php: " . $e->getMessage());
    echo json_encode(["success" => false, "message" => "We couldn't update the occupancy. Please try again."]);
    exit();
}

echo json_encode(["success" => true, "message" => "Occupancy updated to $occ of $capacity." . ($new_status !== $c['status'] ? " Status is now $new_status." : ""), "status" => $new_status]);

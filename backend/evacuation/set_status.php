<?php
/**
 * Admin: open or close an evacuation center (Phase 19).
 * Body: { center_id, status: "Open"|"Closed", notify_residents: bool, send_sms: bool }
 * - Closing requires occupancy 0.
 * - If notify_residents is set, every active resident account receives an
 *   in-app notification (and an SMS if send_sms is also set) AFTER the change
 *   is saved; a notification problem never undoes the change.
 */
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../lib/evacuation.php';
require_once __DIR__ . '/../lib/notify.php';

require_login(['admin']);

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(["success" => false, "message" => "Method not allowed."]);
    exit();
}

$data = json_decode(file_get_contents("php://input"), true);
$center_id = intval($data['center_id'] ?? 0);
$target = $data['status'] ?? '';
$notify = !empty($data['notify_residents']);
$send_sms = $notify && !empty($data['send_sms']);
if ($center_id <= 0 || !in_array($target, ['Open', 'Closed'], true)) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "Choose Open or Closed."]);
    exit();
}

$database = new Database();
$conn = $database->connect();

try {
    $conn->beginTransaction();
    $cur = $conn->prepare("SELECT name, address, purok, capacity, current_occupancy, status FROM evacuation_centers WHERE center_id = :id FOR UPDATE");
    $cur->execute([':id' => $center_id]);
    $c = $cur->fetch(PDO::FETCH_ASSOC);
    if (!$c) {
        $conn->rollBack();
        http_response_code(404);
        echo json_encode(["success" => false, "message" => "Evacuation center not found."]);
        exit();
    }
    $occ = intval($c['current_occupancy']);
    if ($target === 'Closed' && $occ > 0) {
        $conn->rollBack();
        http_response_code(409);
        echo json_encode(["success" => false, "message" => "This center still has $occ evacuee(s). Set the occupancy to 0 before closing it."]);
        exit();
    }
    $new_status = evac_effective_status($target, $occ, intval($c['capacity']));
    if (($target === 'Closed' && $c['status'] === 'Closed') || ($target === 'Open' && $c['status'] !== 'Closed')) {
        $conn->rollBack();
        http_response_code(409);
        echo json_encode(["success" => false, "message" => "This center is already {$c['status']}."]);
        exit();
    }
    $conn->prepare("UPDATE evacuation_centers SET status = :status, updated_by = :admin WHERE center_id = :id")
        ->execute([':status' => $new_status, ':admin' => $_SESSION['user_id'], ':id' => $center_id]);
    $log_id = evac_log_change($conn, $center_id, $occ, $occ, $c['status'], $new_status, $target === 'Open' ? 'Center opened' : 'Center closed');
    log_action($conn, "Evacuation center " . strtolower($target === 'Open' ? 'opened' : 'closed'), "center_id: $center_id ({$c['name']})");
    $conn->commit();
} catch (Exception $e) {
    if ($conn->inTransaction()) $conn->rollBack();
    http_response_code(500);
    error_log("evacuation/set_status.php: " . $e->getMessage());
    echo json_encode(["success" => false, "message" => "We couldn't change the center's status. Please try again."]);
    exit();
}

$extra = "";
if ($notify) {
    $title = $target === 'Open' ? "Evacuation center open: {$c['name']}" : "Evacuation center closed: {$c['name']}";
    $msg = $target === 'Open'
        ? "{$c['name']} ({$c['address']}, {$c['purok']}) is now OPEN for evacuees. Capacity: {$c['capacity']}."
        : "{$c['name']} ({$c['address']}, {$c['purok']}) is now CLOSED.";
    $summary = dispatch_to_all_residents($conn, "evac:$center_id:status:$log_id", $title, $msg,
        ['link' => '/resident/notifications', 'sms' => $send_sms, 'sms_category' => 'Evacuation Center Update', 'sent_by' => $_SESSION['user_id']]);
    $extra = " Residents notified in-app ({$summary['in_app_created']})." . (describe_sms_result($summary) ? " " . describe_sms_result($summary) : "");
}

echo json_encode(["success" => true, "message" => "Center is now $new_status." . $extra, "status" => $new_status]);

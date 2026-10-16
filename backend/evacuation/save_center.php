<?php
/**
 * Admin: add (no center_id) or edit (with center_id) an evacuation center
 * (Phase 19). Occupancy and status are set when adding; afterwards they are
 * changed through update_occupancy.php / set_status.php so every change is
 * logged. Capacity can never be set below the current occupancy.
 */
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../lib/evacuation.php';

require_login(['admin']);

if (!in_array($_SERVER['REQUEST_METHOD'], ['POST', 'PUT'], true)) {
    http_response_code(405);
    echo json_encode(["success" => false, "message" => "Method not allowed."]);
    exit();
}

$data = json_decode(file_get_contents("php://input"), true);
if (!is_array($data)) $data = [];
[$f, $err] = evac_validate_fields($data);
if ($err) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => $err]);
    exit();
}

$database = new Database();
$conn = $database->connect();
$center_id = intval($data['center_id'] ?? 0);

try {
    $conn->beginTransaction();
    if ($center_id > 0) {
        $cur = $conn->prepare("SELECT center_id, current_occupancy, status FROM evacuation_centers WHERE center_id = :id FOR UPDATE");
        $cur->execute([':id' => $center_id]);
        $existing = $cur->fetch(PDO::FETCH_ASSOC);
        if (!$existing) {
            $conn->rollBack();
            http_response_code(404);
            echo json_encode(["success" => false, "message" => "Evacuation center not found."]);
            exit();
        }
        $occ = intval($existing['current_occupancy']);
        if ($f['capacity'] < $occ) {
            $conn->rollBack();
            http_response_code(400);
            echo json_encode(["success" => false, "message" => "Capacity cannot be lower than the current occupancy ($occ). Update the occupancy first."]);
            exit();
        }
        $new_status = evac_effective_status($existing['status'], $occ, $f['capacity']);
        $stmt = $conn->prepare(
            "UPDATE evacuation_centers SET name = :name, address = :address, purok = :purok, latitude = :lat, longitude = :lng,
                    capacity = :capacity, facilities = :facilities, contact_person = :cp, contact_number = :cn,
                    status = :status, updated_by = :admin
             WHERE center_id = :id"
        );
        $stmt->execute([
            ':name' => $f['name'], ':address' => $f['address'], ':purok' => $f['purok'], ':lat' => $f['latitude'], ':lng' => $f['longitude'],
            ':capacity' => $f['capacity'], ':facilities' => $f['facilities'], ':cp' => $f['contact_person'], ':cn' => $f['contact_number'],
            ':status' => $new_status, ':admin' => $_SESSION['user_id'], ':id' => $center_id,
        ]);
        if ($new_status !== $existing['status']) {
            evac_log_change($conn, $center_id, $occ, $occ, $existing['status'], $new_status, "Capacity changed to {$f['capacity']}");
        }
        log_action($conn, "Evacuation center updated", "center_id: $center_id ({$f['name']})");
        $message = "Evacuation center updated.";
    } else {
        $occ = $data['current_occupancy'] ?? 0;
        if (!is_numeric($occ) || intval($occ) != $occ || intval($occ) < 0 || intval($occ) > $f['capacity']) {
            $conn->rollBack();
            http_response_code(400);
            echo json_encode(["success" => false, "message" => "Current occupancy must be a whole number from 0 to the capacity."]);
            exit();
        }
        $occ = intval($occ);
        $status = in_array($data['status'] ?? '', ['Open', 'Closed'], true) ? $data['status'] : 'Closed';
        if ($status === 'Closed' && $occ > 0) $status = 'Open';
        $status = evac_effective_status($status, $occ, $f['capacity']);
        $stmt = $conn->prepare(
            "INSERT INTO evacuation_centers (name, address, purok, latitude, longitude, capacity, current_occupancy, facilities, contact_person, contact_number, status, created_by, updated_by)
             VALUES (:name, :address, :purok, :lat, :lng, :capacity, :occ, :facilities, :cp, :cn, :status, :admin, :admin2)"
        );
        $stmt->execute([
            ':name' => $f['name'], ':address' => $f['address'], ':purok' => $f['purok'], ':lat' => $f['latitude'], ':lng' => $f['longitude'],
            ':capacity' => $f['capacity'], ':occ' => $occ, ':facilities' => $f['facilities'], ':cp' => $f['contact_person'], ':cn' => $f['contact_number'],
            ':status' => $status, ':admin' => $_SESSION['user_id'], ':admin2' => $_SESSION['user_id'],
        ]);
        $center_id = intval($conn->lastInsertId());
        evac_log_change($conn, $center_id, null, $occ, null, $status, "Center added");
        log_action($conn, "Evacuation center added", "center_id: $center_id ({$f['name']})");
        $message = "Evacuation center added.";
    }
    $conn->commit();
} catch (Exception $e) {
    if ($conn->inTransaction()) $conn->rollBack();
    http_response_code(500);
    error_log("evacuation/save_center.php: " . $e->getMessage());
    echo json_encode(["success" => false, "message" => "We couldn't save the evacuation center. Please try again."]);
    exit();
}

echo json_encode(["success" => true, "message" => $message, "center_id" => $center_id]);

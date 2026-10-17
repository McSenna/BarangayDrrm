<?php
require_once __DIR__ . '/../../config/cors.php';
require_once __DIR__ . '/../../config/database.php';

require_login(['admin', 'relief_personnel']);

$schedule_id = intval($_GET['schedule_id'] ?? 0);
if ($schedule_id <= 0) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "The schedule could not be found. Please refresh the page and try again."]);
    exit();
}

$database = new Database();
$conn = $database->connect();

$stmt = $conn->prepare(
    "SELECT ds.*, rp.package_name, rp.description AS package_description,
            u.full_name AS assigned_personnel_name, c.full_name AS created_by_name
     FROM distribution_schedules ds
     JOIN relief_packages rp ON ds.package_id = rp.package_id
     LEFT JOIN users u ON ds.assigned_personnel = u.user_id
     LEFT JOIN users c ON ds.created_by = c.user_id
     WHERE ds.schedule_id = :schedule_id"
);
$stmt->execute([':schedule_id' => $schedule_id]);
$schedule = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$schedule) {
    http_response_code(404);
    echo json_encode(["success" => false, "message" => "Schedule not found."]);
    exit();
}

if ($_SESSION['role'] === 'relief_personnel' && intval($schedule['assigned_personnel']) !== intval($_SESSION['user_id'])) {
    http_response_code(403);
    echo json_encode(["success" => false, "message" => "You are not assigned to this schedule."]);
    exit();
}

$items_stmt = $conn->prepare(
    "SELECT rpi.item_id, rpi.quantity, ri.item_name, ri.unit, ri.quantity AS available_stock
     FROM relief_package_items rpi
     JOIN relief_items ri ON rpi.item_id = ri.item_id
     WHERE rpi.package_id = :package_id"
);
$items_stmt->execute([':package_id' => $schedule['package_id']]);
$schedule['package_items'] = $items_stmt->fetchAll(PDO::FETCH_ASSOC);

$ben_stmt = $conn->prepare(
    "SELECT db.*, h.head_of_family, h.purok, h.address, h.contact_number, h.number_of_members, h.vulnerable_members,
            v.full_name AS verified_by_name, su.full_name AS status_updated_by_name
     FROM distribution_beneficiaries db
     JOIN households h ON db.household_id = h.household_id
     LEFT JOIN users v ON db.verified_by = v.user_id
     LEFT JOIN users su ON db.status_updated_by = su.user_id
     WHERE db.schedule_id = :schedule_id
     ORDER BY db.beneficiary_id ASC"
);
$ben_stmt->execute([':schedule_id' => $schedule_id]);
$schedule['beneficiaries'] = field_scope_rows($conn, $ben_stmt->fetchAll(PDO::FETCH_ASSOC));
if (staff_has_purok_scope() && !$schedule['beneficiaries']) field_scope_denied();

echo json_encode(["success" => true, "data" => $schedule]);

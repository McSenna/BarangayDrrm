<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';

require_login(['relief_personnel', 'admin']);

$database = new Database();
$conn = $database->connect();
$beneficiary_scope = staff_household_condition($conn, 'db');
$allocation_scope = staff_household_condition($conn, 'ra');
$schedule_scope = staff_has_purok_scope() ? "EXISTS (SELECT 1 FROM distribution_beneficiaries db WHERE db.schedule_id = ds.schedule_id AND $beneficiary_scope)" : '1=1';

// Admins can optionally pass ?personnel_id= to view another personnel's stats;
// relief personnel always see their own.
$personnel_id = $_SESSION['role'] === 'admin'
    ? intval($_GET['personnel_id'] ?? 0)
    : intval($_SESSION['user_id']);

if ($personnel_id <= 0) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "Please select a Relief Personnel account to view."]);
    exit();
}

$assigned_schedules_count = $conn->prepare(
    "SELECT COUNT(*) FROM distribution_schedules ds WHERE assigned_personnel = :personnel_id AND $schedule_scope"
);
$assigned_schedules_count->execute([':personnel_id' => $personnel_id]);

$today_stmt = $conn->prepare(
    "SELECT ds.schedule_id, ds.distribution_time, ds.location, rp.package_name,
            (SELECT COUNT(*) FROM distribution_beneficiaries db WHERE schedule_id = ds.schedule_id AND $beneficiary_scope) AS total_beneficiaries,
            (SELECT COUNT(*) FROM distribution_beneficiaries db WHERE schedule_id = ds.schedule_id AND $beneficiary_scope AND status = 'Delivered') AS delivered_count
     FROM distribution_schedules ds
     JOIN relief_packages rp ON ds.package_id = rp.package_id
     WHERE ds.assigned_personnel = :personnel_id AND $schedule_scope AND ds.distribution_date = CURDATE()
     ORDER BY ds.distribution_time ASC"
);
$today_stmt->execute([':personnel_id' => $personnel_id]);
$today_schedules = $today_stmt->fetchAll(PDO::FETCH_ASSOC);

$pending_stmt = $conn->prepare(
    "SELECT COUNT(*) FROM distribution_beneficiaries db
     JOIN distribution_schedules ds ON db.schedule_id = ds.schedule_id
     WHERE ds.assigned_personnel = :personnel_id AND $beneficiary_scope AND db.status IN ('Pending','Prepared','Dispatched')"
);
$pending_stmt->execute([':personnel_id' => $personnel_id]);

$completed_stmt = $conn->prepare(
    "SELECT COUNT(*) FROM distribution_beneficiaries db
     JOIN distribution_schedules ds ON db.schedule_id = ds.schedule_id
     WHERE ds.assigned_personnel = :personnel_id AND $beneficiary_scope AND db.status = 'Delivered'"
);
$completed_stmt->execute([':personnel_id' => $personnel_id]);

// Phase 19 — additional distribution figures for the personnel dashboard (added; existing keys unchanged).
$by_status_stmt = $conn->prepare(
    "SELECT db.status, COUNT(*) AS c FROM distribution_beneficiaries db
     JOIN distribution_schedules ds ON db.schedule_id = ds.schedule_id
     WHERE ds.assigned_personnel = :personnel_id AND $beneficiary_scope GROUP BY db.status"
);
$by_status_stmt->execute([':personnel_id' => $personnel_id]);
$beneficiaries_by_status = [];
foreach ($by_status_stmt->fetchAll(PDO::FETCH_ASSOC) as $r) $beneficiaries_by_status[$r['status']] = intval($r['c']);

$unverified_stmt = $conn->prepare(
    "SELECT COUNT(*) FROM distribution_beneficiaries db
     JOIN distribution_schedules ds ON db.schedule_id = ds.schedule_id
     WHERE ds.assigned_personnel = :personnel_id AND $beneficiary_scope AND db.is_verified = 0 AND db.status NOT IN ('Delivered','Cancelled')"
);
$unverified_stmt->execute([':personnel_id' => $personnel_id]);

// Ready for Distribution allocations this person may complete (their Purok scope).
$approved_stmt = $conn->prepare(
    "SELECT COUNT(*) FROM household_allocations ra WHERE $allocation_scope AND ra.status = 'READY_FOR_DISTRIBUTION'"
);
$approved_stmt->execute();

$upcoming_stmt = $conn->prepare(
    "SELECT ds.schedule_id, ds.distribution_date, ds.distribution_time, ds.location, rp.package_name,
            (SELECT COUNT(*) FROM distribution_beneficiaries db WHERE schedule_id = ds.schedule_id AND $beneficiary_scope) AS total_beneficiaries,
            (SELECT COUNT(*) FROM distribution_beneficiaries db WHERE schedule_id = ds.schedule_id AND $beneficiary_scope AND status = 'Delivered') AS delivered_count
     FROM distribution_schedules ds JOIN relief_packages rp ON ds.package_id = rp.package_id
     WHERE ds.assigned_personnel = :personnel_id AND $schedule_scope AND ds.distribution_date > CURDATE()
     ORDER BY ds.distribution_date ASC, ds.distribution_time ASC LIMIT 5"
);
$upcoming_stmt->execute([':personnel_id' => $personnel_id]);

echo json_encode([
    "success" => true,
    "data" => [
        "assigned_schedules_count" => intval($assigned_schedules_count->fetchColumn()),
        "today_schedules" => $today_schedules,
        "pending_deliveries_count" => intval($pending_stmt->fetchColumn()),
        "completed_deliveries_count" => intval($completed_stmt->fetchColumn()),
        "beneficiaries_by_status" => $beneficiaries_by_status,
        "pending_verification_count" => intval($unverified_stmt->fetchColumn()),
        "approved_allocations_count" => $ready_count = intval($approved_stmt->fetchColumn()),
        "ready_allocations_count" => $ready_count,
        "upcoming_schedules" => $upcoming_stmt->fetchAll(PDO::FETCH_ASSOC),
    ]
]);

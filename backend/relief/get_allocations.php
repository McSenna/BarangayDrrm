<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';

require_login(); // residents: own household only (below)

$database = new Database();
$conn = $database->connect();

$base_query = "SELECT ra.*, h.head_of_family, h.purok, ri.item_name, ri.unit,
                      ap.full_name AS approved_by_name, dp.full_name AS distributed_by_name,
                      cb.full_name AS cancelled_by_name,
                      ds.distribution_date AS schedule_date, ds.location AS schedule_location,
                      sp.full_name AS schedule_personnel_name
               FROM relief_allocations ra
               JOIN households h ON ra.household_id = h.household_id
               JOIN relief_items ri ON ra.item_id = ri.item_id
               LEFT JOIN users ap ON ra.approved_by = ap.user_id
               LEFT JOIN users dp ON ra.distributed_by = dp.user_id
               LEFT JOIN users cb ON cb.user_id = " . ($conn->query("SHOW COLUMNS FROM relief_allocations LIKE 'cancelled_by'")->fetch() ? "ra.cancelled_by" : "NULL") . "
               LEFT JOIN distribution_schedules ds ON ra.schedule_id = ds.schedule_id
               LEFT JOIN users sp ON ds.assigned_personnel = sp.user_id";

if ($_SESSION['role'] === 'resident') {
    // Residents can only see allocations for their own household
    $stmt = $conn->prepare($base_query . "
        JOIN users u ON h.user_id = u.user_id
        WHERE u.user_id = :user_id
        ORDER BY ra.allocation_date DESC");
    $stmt->execute([':user_id' => $_SESSION['user_id']]);
} else {
    // admin and relief_personnel see everything
    $stmt = $conn->prepare($base_query . " ORDER BY ra.allocation_date DESC");
    $stmt->execute();
}

$allocations = $stmt->fetchAll(PDO::FETCH_ASSOC);

// Phase 21 — "Ready for Distribution" is an Approved allocation with ready_at
// set (the stored status stays 'Approved' so stock stays reserved). The
// display_status is what residents and personnel see.
foreach ($allocations as &$a) {
    $ready = ($a['status'] ?? '') === 'Approved' && !empty($a['ready_at']);
    $a['display_status'] = $ready ? 'Ready for Distribution' : $a['status'];
    if (!array_key_exists('ready_at', $a)) {
        $a['ready_at'] = null;
        $a['ready_schedule_date'] = null;
        $a['ready_schedule_time'] = null;
        $a['ready_location'] = null;
        $a['ready_instructions'] = null;
    }
    if ($_SESSION['role'] === 'resident') {
        // Residents see their own allocation details only; staff names are not needed.
        unset($a['approved_by'], $a['distributed_by'], $a['ready_by'], $a['recommendation_reason']);
        // Phase 25: DSS snapshot, override reason and staff names are staff-only.
        unset($a['dss_score'], $a['dss_category'], $a['dss_rank'], $a['dss_ratings'], $a['dss_model_version'],
              $a['override_reason'], $a['is_emergency_override'], $a['cancelled_by'], $a['cancelled_by_name'],
              $a['approved_by_name'], $a['distributed_by_name'], $a['distribution_remarks']);
    }
}
unset($a);

echo json_encode(["success" => true, "data" => $allocations]);

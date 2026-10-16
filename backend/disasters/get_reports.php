<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../lib/report_ref.php';

require_login(['admin', 'relief_personnel']); // Phase 21: staff only (residents no longer use this data)

$database = new Database();
$conn = $database->connect();

// Phase 23: + household coordinates and the damage assessment summary (for Hazard Monitoring and the map).
$base_select = "SELECT dr.*, u.full_name AS resident_name, h.head_of_family, h.purok,
                       h.latitude AS household_latitude, h.longitude AS household_longitude,
                       da.house_damage, da.infrastructure_damage, da.property_damage, da.agricultural_damage,
                       (da.assessment_id IS NOT NULL) AS has_assessment,
                       v.full_name AS verified_by_name,
                       (SELECT COUNT(*) FROM report_photos rp WHERE rp.report_id = dr.report_id) AS photo_count
                FROM disaster_reports dr
                JOIN users u ON dr.user_id = u.user_id
                LEFT JOIN households h ON dr.household_id = h.household_id
                LEFT JOIN users v ON dr.verified_by = v.user_id
                LEFT JOIN damage_assessments da ON da.report_id = dr.report_id";

if ($_SESSION['role'] === 'resident') {
    $stmt = $conn->prepare($base_select . " WHERE dr.user_id = :user_id ORDER BY dr.created_at DESC");
    $stmt->execute([':user_id' => $_SESSION['user_id']]);
    echo json_encode(["success" => true, "data" => with_report_reference($stmt->fetchAll(PDO::FETCH_ASSOC))]);
    exit();
}

// Admin / relief personnel: support history filters
$sql = $base_select . " WHERE 1=1";
$params = [];

$user_id = $_GET['user_id'] ?? '';
$household_id = $_GET['household_id'] ?? '';
$disaster_type = $_GET['disaster_type'] ?? '';
$purok = $_GET['purok'] ?? '';
$status = $_GET['status'] ?? '';

if ($user_id !== '') {
    $sql .= " AND dr.user_id = :user_id";
    $params[':user_id'] = intval($user_id);
}
if ($household_id !== '') {
    $sql .= " AND dr.household_id = :household_id";
    $params[':household_id'] = intval($household_id);
}
if ($disaster_type !== '') {
    // No longer a fixed whitelist (Phase 14: disaster types are admin-managed),
    // so accept whatever value is supplied and let the parameterized query bind it safely.
    $sql .= " AND dr.disaster_type = :disaster_type";
    $params[':disaster_type'] = $disaster_type;
}
if ($purok !== '') {
    $sql .= " AND h.purok = :purok";
    $params[':purok'] = $purok;
}
$severity = $_GET['severity'] ?? '';
if (in_array($severity, ['Low', 'Medium', 'High', 'Critical'], true)) {
    $sql .= " AND dr.severity = :severity";
    $params[':severity'] = $severity;
}
if (in_array($status, ['Pending', 'Verified', 'Rejected'])) {
    $sql .= " AND dr.status = :status";
    $params[':status'] = $status;
}

$sql .= " ORDER BY dr.created_at DESC";

$stmt = $conn->prepare($sql);
$stmt->execute($params);

echo json_encode(["success" => true, "data" => with_report_reference($stmt->fetchAll(PDO::FETCH_ASSOC))]);

<?php
require_once __DIR__ . '/../../config/cors.php';
require_once __DIR__ . '/../../config/database.php';

require_login(['admin', 'relief_personnel']);

$database = new Database();
$conn = $database->connect();

$search = trim($_GET['search'] ?? '');
$verified_filter = $_GET['verified'] ?? ''; // '1', '0', or '' for any
$status_filter = $_GET['status'] ?? '';

$sql = "SELECT db.beneficiary_id, db.schedule_id, db.household_id, db.is_verified, db.verified_at, db.status,
               h.head_of_family, h.purok, h.address, h.contact_number,
               ds.distribution_date, ds.location, rp.package_name,
               v.full_name AS verified_by_name
        FROM distribution_beneficiaries db
        JOIN households h ON db.household_id = h.household_id
        JOIN distribution_schedules ds ON db.schedule_id = ds.schedule_id
        JOIN relief_packages rp ON ds.package_id = rp.package_id
        LEFT JOIN users v ON db.verified_by = v.user_id
        WHERE 1=1";
$params = [];

if ($_SESSION['role'] === 'relief_personnel') {
    $sql .= " AND ds.assigned_personnel = :user_id";
    $params[':user_id'] = $_SESSION['user_id'];
}

if ($search !== '') {
    $sql .= " AND h.head_of_family LIKE :search";
    $params[':search'] = "%$search%";
}
if ($verified_filter === '1') {
    $sql .= " AND db.is_verified = 1";
} elseif ($verified_filter === '0') {
    $sql .= " AND db.is_verified = 0";
}
if (in_array($status_filter, ['Pending', 'Prepared', 'Dispatched', 'Delivered', 'Cancelled'])) {
    $sql .= " AND db.status = :status";
    $params[':status'] = $status_filter;
}

$sql .= " ORDER BY ds.distribution_date DESC, h.head_of_family ASC";

$stmt = $conn->prepare($sql);
$stmt->execute($params);

echo json_encode(["success" => true, "data" => $stmt->fetchAll(PDO::FETCH_ASSOC)]);

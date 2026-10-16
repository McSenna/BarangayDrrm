<?php
require_once __DIR__ . '/../../config/cors.php';
require_once __DIR__ . '/../../config/database.php';

require_login(['admin', 'relief_personnel']);

$database = new Database();
$conn = $database->connect();

$search = trim($_GET['search'] ?? '');
$date_from = $_GET['date_from'] ?? '';
$date_to = $_GET['date_to'] ?? '';

$sql = "SELECT db.beneficiary_id, db.schedule_id, db.household_id, db.status_updated_at,
               h.head_of_family, h.purok,
               ds.distribution_date, ds.location, rp.package_name,
               dr.report_id, dr.recipient_name, dr.remarks,
               (SELECT COUNT(*) FROM delivery_report_photos WHERE report_id = dr.report_id) AS photo_count
        FROM distribution_beneficiaries db
        JOIN households h ON db.household_id = h.household_id
        JOIN distribution_schedules ds ON db.schedule_id = ds.schedule_id
        JOIN relief_packages rp ON ds.package_id = rp.package_id
        LEFT JOIN delivery_reports dr ON dr.beneficiary_id = db.beneficiary_id
        WHERE db.status = 'Delivered'";
$params = [];

if ($_SESSION['role'] === 'relief_personnel') {
    $sql .= " AND ds.assigned_personnel = :user_id";
    $params[':user_id'] = $_SESSION['user_id'];
}

if ($search !== '') {
    $sql .= " AND (h.head_of_family LIKE :search OR dr.recipient_name LIKE :search)";
    $params[':search'] = "%$search%";
}
if ($date_from !== '') {
    $sql .= " AND ds.distribution_date >= :date_from";
    $params[':date_from'] = $date_from;
}
if ($date_to !== '') {
    $sql .= " AND ds.distribution_date <= :date_to";
    $params[':date_to'] = $date_to;
}

$sql .= " ORDER BY db.status_updated_at DESC";

$stmt = $conn->prepare($sql);
$stmt->execute($params);

echo json_encode(["success" => true, "data" => $stmt->fetchAll(PDO::FETCH_ASSOC)]);

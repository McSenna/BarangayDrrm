<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';

require_login(['admin']);

$database = new Database();
$conn = $database->connect();

$search = trim($_GET['search'] ?? '');
$status = $_GET['status'] ?? '';
$date_from = $_GET['date_from'] ?? '';
$date_to = $_GET['date_to'] ?? '';

$sql = "SELECT lh.*, u.full_name AS user_name, u.role AS user_role
        FROM login_history lh
        LEFT JOIN users u ON lh.user_id = u.user_id
        WHERE 1=1";
$params = [];

if ($search !== '') {
    $sql .= " AND (lh.email_attempted LIKE :search OR u.full_name LIKE :search)";
    $params[':search'] = "%$search%";
}
if (in_array($status, ['Success', 'Failed'])) {
    $sql .= " AND lh.login_status = :status";
    $params[':status'] = $status;
}
if ($date_from !== '') {
    $sql .= " AND DATE(lh.login_at) >= :date_from";
    $params[':date_from'] = $date_from;
}
if ($date_to !== '') {
    $sql .= " AND DATE(lh.login_at) <= :date_to";
    $params[':date_to'] = $date_to;
}

$sql .= " ORDER BY lh.login_at DESC LIMIT 500";

$stmt = $conn->prepare($sql);
$stmt->execute($params);

echo json_encode(["success" => true, "data" => $stmt->fetchAll(PDO::FETCH_ASSOC)]);

<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';

require_login(['admin']);

$database = new Database();
$conn = $database->connect();

$search = trim($_GET['search'] ?? '');
$user_id = $_GET['user_id'] ?? '';
$date_from = $_GET['date_from'] ?? '';
$date_to = $_GET['date_to'] ?? '';

$sql = "SELECT al.*, u.full_name AS user_name, u.role AS user_role
        FROM audit_logs al
        LEFT JOIN users u ON al.user_id = u.user_id
        WHERE 1=1";
$params = [];

if ($search !== '') {
    $sql .= " AND (al.action LIKE :search OR al.details LIKE :search)";
    $params[':search'] = "%$search%";
}
if ($user_id !== '') {
    $sql .= " AND al.user_id = :user_id";
    $params[':user_id'] = intval($user_id);
}
if ($date_from !== '') {
    $sql .= " AND DATE(al.created_at) >= :date_from";
    $params[':date_from'] = $date_from;
}
if ($date_to !== '') {
    $sql .= " AND DATE(al.created_at) <= :date_to";
    $params[':date_to'] = $date_to;
}

$sql .= " ORDER BY al.created_at DESC LIMIT 500";

$stmt = $conn->prepare($sql);
$stmt->execute($params);

echo json_encode(["success" => true, "data" => $stmt->fetchAll(PDO::FETCH_ASSOC)]);

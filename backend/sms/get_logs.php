<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';

require_login(['admin']);

$database = new Database();
$conn = $database->connect();

$search = trim($_GET['search'] ?? '');
$recipient_type = $_GET['recipient_type'] ?? '';
$category = $_GET['category'] ?? '';
$status = $_GET['status'] ?? '';
$date_from = $_GET['date_from'] ?? '';
$date_to = $_GET['date_to'] ?? '';

$sql = "SELECT sl.*, u.full_name AS sent_by_name
        FROM sms_logs sl
        LEFT JOIN users u ON sl.sent_by = u.user_id
        WHERE 1=1";
$params = [];

if ($search !== '') {
    $sql .= " AND (sl.recipient_name LIKE :search OR sl.recipient_number LIKE :search OR sl.message LIKE :search)";
    $params[':search'] = "%$search%";
}
if (in_array($recipient_type, ['Resident', 'Relief Personnel', 'Household', 'Custom'])) {
    $sql .= " AND sl.recipient_type = :recipient_type";
    $params[':recipient_type'] = $recipient_type;
}
if ($category !== '') {
    $sql .= " AND sl.category = :category";
    $params[':category'] = $category;
}
if (in_array($status, ['Sent', 'Failed', 'Not Configured', 'Queued', 'Accepted by Gateway', 'Delivered'], true)) {
    $sql .= " AND sl.status = :status";
    $params[':status'] = $status;
}
if ($date_from !== '') {
    $sql .= " AND DATE(sl.sent_at) >= :date_from";
    $params[':date_from'] = $date_from;
}
if ($date_to !== '') {
    $sql .= " AND DATE(sl.sent_at) <= :date_to";
    $params[':date_to'] = $date_to;
}

$sql .= " ORDER BY sl.sent_at DESC LIMIT 300";

$stmt = $conn->prepare($sql);
$stmt->execute($params);

echo json_encode(["success" => true, "data" => $stmt->fetchAll(PDO::FETCH_ASSOC)]);

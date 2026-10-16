<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';

require_login(['admin']);

$database = new Database();
$conn = $database->connect();

// Optional filters: role, status (active/inactive), search (name or email)
$role = $_GET['role'] ?? '';
$status = $_GET['status'] ?? '';
$search = trim($_GET['search'] ?? '');

$sql = "SELECT user_id, full_name, email, role, is_active, contact_number, created_at FROM users WHERE 1=1";
$params = [];

if (in_array($role, ['admin', 'resident', 'relief_personnel'])) {
    $sql .= " AND role = :role";
    $params[':role'] = $role;
}

if ($status === 'active') {
    $sql .= " AND is_active = 1";
} elseif ($status === 'inactive') {
    $sql .= " AND is_active = 0";
}

if ($search !== '') {
    $sql .= " AND (full_name LIKE :search OR email LIKE :search)";
    $params[':search'] = "%$search%";
}

$sql .= " ORDER BY created_at DESC";

$stmt = $conn->prepare($sql);
$stmt->execute($params);
$users = $stmt->fetchAll(PDO::FETCH_ASSOC);

echo json_encode(["success" => true, "data" => $users]);

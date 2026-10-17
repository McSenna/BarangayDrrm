<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';

require_login(['admin']);
header('Cache-Control: no-store');

// Opt-in paging/export preserves the array contract used by existing clients.
if (isset($_GET['managed'])) {
    require __DIR__ . '/list_managed.php';
    exit();
}

$database = new Database();
$conn = $database->connect();
require_once __DIR__ . '/registration.php';
$approval = registration_expression($conn, 'users.user_id');

// Optional filters: role, status (active/inactive), search (name or email)
$role = $_GET['role'] ?? '';
$status = $_GET['status'] ?? '';
$search = trim($_GET['search'] ?? '');

$sql = "SELECT user_id, full_name, email, role, is_active, contact_number, created_at, assigned_purok, $approval registration_status FROM users WHERE $approval = 'approved'";
$params = [];

if (in_array($role, ['admin', 'resident', 'relief_personnel', 'field_officer'])) {
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
require_once __DIR__ . '/management.php';
foreach ($users as &$user) $user['version'] = um_version($user);
unset($user);

echo json_encode(["success" => true, "data" => $users]);

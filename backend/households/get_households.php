<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';

require_login(); // any logged-in role may view

$database = new Database();
$conn = $database->connect();

if ($_SESSION['role'] === 'resident') {
    // Residents only see their own household
    $stmt = $conn->prepare("SELECT * FROM households WHERE user_id = :user_id ORDER BY household_id DESC");
    $stmt->execute([':user_id' => $_SESSION['user_id']]);
    $households = $stmt->fetchAll(PDO::FETCH_ASSOC);
    echo json_encode(["success" => true, "data" => $households]);
    exit();
}

// Admin / relief personnel: support search & filters
$search = trim($_GET['search'] ?? '');
$purok = trim($_GET['purok'] ?? '');
$min_members = $_GET['min_members'] ?? '';
$max_members = $_GET['max_members'] ?? '';
$vulnerability = $_GET['vulnerability'] ?? ''; // any | children | seniors | pwd | pregnant | medical | other

// h.* plus two read-only, additive lookups used by the Barangay Map's search
// (Step 3): the linked resident account's name, and a comma-joined list of
// named household members — both from existing tables (users, household_members),
// no schema change. Every existing column is still present under its own name.
$sql = "SELECT h.*,
               ur.full_name AS resident_account_name,
               (SELECT GROUP_CONCAT(hm.full_name SEPARATOR ', ')
                  FROM household_members hm WHERE hm.household_id = h.household_id) AS member_names
        FROM households h
        LEFT JOIN users ur ON h.user_id = ur.user_id
        WHERE 1=1";
$params = [];

if ($search !== '') {
    $sql .= " AND (head_of_family LIKE :search OR address LIKE :search OR purok LIKE :search)";
    $params[':search'] = "%$search%";
}

if ($purok !== '') {
    $sql .= " AND purok = :purok";
    $params[':purok'] = $purok;
}

if ($min_members !== '') {
    $sql .= " AND number_of_members >= :min_members";
    $params[':min_members'] = intval($min_members);
}

if ($max_members !== '') {
    $sql .= " AND number_of_members <= :max_members";
    $params[':max_members'] = intval($max_members);
}

$vuln_columns = [
    'children' => 'children_count',
    'seniors' => 'seniors_count',
    'pwd' => 'pwd_count',
    'pregnant' => 'pregnant_count',
    'medical' => 'medical_needs_count',
    'other' => 'other_vulnerable_count',
];

if ($vulnerability === 'any') {
    $sql .= " AND vulnerable_members > 0";
} elseif (isset($vuln_columns[$vulnerability])) {
    $sql .= " AND {$vuln_columns[$vulnerability]} > 0";
}

$sql .= " ORDER BY household_id DESC";

$stmt = $conn->prepare($sql);
$stmt->execute($params);
$households = $stmt->fetchAll(PDO::FETCH_ASSOC);

echo json_encode(["success" => true, "data" => $households]);

<?php
/**
 * Evacuation centers (Phase 19). Any logged-in user may view them — this is
 * public safety information. Residents receive only facility information
 * (no audit fields). Optional filter: status.
 */
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';

require_login(['admin', 'relief_personnel']); // Phase 21: staff only (residents no longer use this data)

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(["success" => false, "message" => "Method not allowed."]);
    exit();
}

$database = new Database();
$conn = $database->connect();

$where = "";
$params = [];
$status = $_GET['status'] ?? '';
if (in_array($status, ['Open', 'Closed', 'Full'], true)) {
    $where = " WHERE c.status = :status";
    $params[':status'] = $status;
}

$is_admin = $_SESSION['role'] === 'admin';
$fields = "c.center_id, c.name, c.address, c.purok, c.latitude, c.longitude, c.capacity, c.current_occupancy,
           c.facilities, c.contact_person, c.contact_number, c.status, c.updated_at";
if ($is_admin) {
    $fields .= ", c.created_at, cu.full_name AS created_by_name, uu.full_name AS updated_by_name";
}

$stmt = $conn->prepare(
    "SELECT $fields FROM evacuation_centers c
     LEFT JOIN users cu ON cu.user_id = c.created_by
     LEFT JOIN users uu ON uu.user_id = c.updated_by
     $where
     ORDER BY FIELD(c.status, 'Open', 'Full', 'Closed'), c.name ASC"
);
$stmt->execute($params);
$rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

$totals = ['centers' => count($rows), 'open' => 0, 'full' => 0, 'closed' => 0, 'capacity_open' => 0, 'occupancy' => 0];
foreach ($rows as $r) {
    $totals[strtolower($r['status'])]++;
    $totals['occupancy'] += intval($r['current_occupancy']);
    if ($r['status'] !== 'Closed') $totals['capacity_open'] += intval($r['capacity']);
}

echo json_encode(["success" => true, "data" => $rows, "totals" => $totals]);

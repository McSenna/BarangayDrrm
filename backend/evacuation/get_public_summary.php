<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';

// Intentionally PUBLIC (no require_login call), like hazards/get_public_status.php:
// whether evacuation centers are open and how much space is left is public
// safety information for the landing page. Totals only — no center names,
// addresses, contacts or evacuee details. Closed centers are not counted.

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(["success" => false, "message" => "Method not allowed."]);
    exit();
}

$database = new Database();
$conn = $database->connect();

$row = $conn->query(
    "SELECT COUNT(*) AS open_centers,
            COALESCE(SUM(capacity), 0) AS capacity,
            COALESCE(SUM(current_occupancy), 0) AS occupied,
            MAX(updated_at) AS updated_at
     FROM evacuation_centers
     WHERE status <> 'Closed'"
)->fetch(PDO::FETCH_ASSOC);

echo json_encode([
    "success" => true,
    "data" => [
        "open_centers" => intval($row['open_centers']),
        "capacity" => intval($row['capacity']),
        "occupied" => intval($row['occupied']),
        "updated_at" => $row['updated_at'],
    ],
]);

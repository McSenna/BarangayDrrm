<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';

// Intentionally PUBLIC (no require_login()): the barangay name and contact
// details must be able to show on the public Home/About/Contact pages and
// navbar/sidebar before anyone logs in. Nothing sensitive is stored here —
// only display text (barangay name, address, office hours, contact info,
// and inventory defaults). Writing settings still requires admin login
// (see update_settings.php).

$database = new Database();
$conn = $database->connect();

$stmt = $conn->query("SELECT setting_key, setting_value FROM system_settings");
$rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

$settings = [];
foreach ($rows as $row) {
    $settings[$row['setting_key']] = $row['setting_value'];
}

echo json_encode(["success" => true, "data" => $settings]);

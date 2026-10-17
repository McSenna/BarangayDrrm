<?php
require_once __DIR__ . '/../../config/cors.php';
require_once __DIR__ . '/../../config/database.php';

require_login(['admin']);

$data = json_decode(file_get_contents("php://input"), true);
$package_id = intval($data['package_id'] ?? $_GET['package_id'] ?? 0);

if ($package_id <= 0) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "The package could not be found. Please refresh the page and try again."]);
    exit();
}

$database = new Database();
$conn = $database->connect();

// The standard relief package (planned items for every Ready household) cannot be deleted while it is in use.
$standard = $conn->query("SELECT setting_value FROM system_settings WHERE setting_key = 'standard_relief_package_id'")->fetchColumn();
if ((string)$standard === (string)$package_id) {
    http_response_code(409);
    echo json_encode(["success" => false, "message" => "This is the standard relief package. Choose another standard package before deleting it."]);
    exit();
}

$check = $conn->prepare("SELECT COUNT(*) FROM distribution_schedules WHERE package_id = :package_id");
$check->execute([':package_id' => $package_id]);
if (intval($check->fetchColumn()) > 0) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "This package is used in one or more distribution schedules and cannot be deleted. You can mark it as Inactive instead."]);
    exit();
}

$conn->prepare("DELETE FROM relief_packages WHERE package_id = :package_id")->execute([':package_id' => $package_id]);

log_action($conn, "Relief package deleted", "package_id: $package_id");

echo json_encode(["success" => true, "message" => "Package deleted."]);

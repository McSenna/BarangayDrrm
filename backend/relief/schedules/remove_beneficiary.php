<?php
require_once __DIR__ . '/../../config/cors.php';
require_once __DIR__ . '/../../config/database.php';

require_login(['admin']);

$data = json_decode(file_get_contents("php://input"), true);
$beneficiary_id = intval($data['beneficiary_id'] ?? $_GET['beneficiary_id'] ?? 0);

if ($beneficiary_id <= 0) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "The beneficiary could not be found. Please refresh the page and try again."]);
    exit();
}

$database = new Database();
$conn = $database->connect();

$check = $conn->prepare("SELECT status FROM distribution_beneficiaries WHERE beneficiary_id = :beneficiary_id");
$check->execute([':beneficiary_id' => $beneficiary_id]);
$row = $check->fetch(PDO::FETCH_ASSOC);

if (!$row) {
    http_response_code(404);
    echo json_encode(["success" => false, "message" => "Beneficiary not found."]);
    exit();
}

if (!in_array($row['status'], ['Pending', 'Cancelled'])) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "Only Pending or Cancelled beneficiaries can be removed. If relief is already in progress, select Cancel instead."]);
    exit();
}

$conn->prepare("DELETE FROM distribution_beneficiaries WHERE beneficiary_id = :beneficiary_id")->execute([':beneficiary_id' => $beneficiary_id]);

log_action($conn, "Beneficiary removed from schedule", "beneficiary_id: $beneficiary_id");

echo json_encode(["success" => true, "message" => "Beneficiary removed."]);

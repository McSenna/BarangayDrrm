<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';

// Phase 21: field assessments may be recorded by the Administrator or Relief Personnel.
require_login(['admin', 'relief_personnel']);

$data = json_decode(file_get_contents("php://input"), true);
$report_id = intval($data['report_id'] ?? 0);

if ($report_id <= 0) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "The disaster report could not be found. Please refresh the page and try again."]);
    exit();
}

$damage_levels = ['None', 'Minor', 'Major', 'Totally Damaged'];
$severity_levels = ['Low', 'Medium', 'High', 'Critical'];

$house_damage = in_array($data['house_damage'] ?? '', $damage_levels) ? $data['house_damage'] : 'None';
$infrastructure_damage = in_array($data['infrastructure_damage'] ?? '', $damage_levels) ? $data['infrastructure_damage'] : 'None';
$property_damage = in_array($data['property_damage'] ?? '', $damage_levels) ? $data['property_damage'] : 'None';
$agricultural_damage = in_array($data['agricultural_damage'] ?? '', $damage_levels) ? $data['agricultural_damage'] : 'None';
$estimated_severity = in_array($data['estimated_severity'] ?? '', $severity_levels) ? $data['estimated_severity'] : 'Low';
$remarks = trim($data['remarks'] ?? '');

$database = new Database();
$conn = $database->connect();

$check = $conn->prepare("SELECT report_id FROM disaster_reports WHERE report_id = :report_id");
$check->execute([':report_id' => $report_id]);
if (!$check->fetch()) {
    http_response_code(404);
    echo json_encode(["success" => false, "message" => "The disaster report could not be found. It may have been removed."]);
    exit();
}

// Upsert: one assessment per report (report_id is UNIQUE)
$stmt = $conn->prepare(
    "INSERT INTO damage_assessments
        (report_id, house_damage, infrastructure_damage, property_damage, agricultural_damage, estimated_severity, remarks, assessed_by, assessed_at)
     VALUES
        (:report_id, :house_damage, :infrastructure_damage, :property_damage, :agricultural_damage, :estimated_severity, :remarks, :assessed_by, NOW())
     ON DUPLICATE KEY UPDATE
        house_damage = VALUES(house_damage),
        infrastructure_damage = VALUES(infrastructure_damage),
        property_damage = VALUES(property_damage),
        agricultural_damage = VALUES(agricultural_damage),
        estimated_severity = VALUES(estimated_severity),
        remarks = VALUES(remarks),
        assessed_by = VALUES(assessed_by),
        assessed_at = NOW()"
);

$stmt->execute([
    ':report_id' => $report_id,
    ':house_damage' => $house_damage,
    ':infrastructure_damage' => $infrastructure_damage,
    ':property_damage' => $property_damage,
    ':agricultural_damage' => $agricultural_damage,
    ':estimated_severity' => $estimated_severity,
    ':remarks' => $remarks,
    ':assessed_by' => $_SESSION['user_id'],
]);

log_action($conn, "Damage assessment saved", "report_id: $report_id, by {$_SESSION['role']}, house: $house_damage, infrastructure: $infrastructure_damage, property: $property_damage, agricultural: $agricultural_damage");

echo json_encode(["success" => true, "message" => "Damage assessment saved."]);

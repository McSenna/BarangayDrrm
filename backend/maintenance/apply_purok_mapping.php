<?php
/**
 * Purok Cleanup — replace one old purok value with a standard purok in
 * households, hazard alerts and evacuation centers (Phase 19, admin only).
 *
 * Nothing changes automatically: the Administrator reviews each old value and
 * confirms the mapping. The change runs in one transaction and is written to
 * the audit log with the number of records changed.
 */
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../lib/puroks.php';

require_login(['admin']);

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(["success" => false, "message" => "Method not allowed."]);
    exit();
}

$data = json_decode(file_get_contents("php://input"), true);
if (!is_array($data)) $data = [];
$old_value = isset($data['old_value']) ? (string) $data['old_value'] : '';
$new_value = trim((string) ($data['new_value'] ?? ''));

if ($old_value === '' || !in_array($new_value, BINITAYAN_PUROKS, true)) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "Select the old value and a standard purok to replace it with."]);
    exit();
}
if ($old_value === $new_value) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "This value is already the standard purok."]);
    exit();
}

$database = new Database();
$conn = $database->connect();

try {
    $conn->beginTransaction();
    $counts = [];
    foreach ([
        'households' => "UPDATE households SET purok = :new WHERE purok = :old",
        // Only older single-value alerts; Phase 33 alerts keep their Puroks in hazard_alert_puroks (always standard).
        'hazard_alerts' => "UPDATE hazard_alerts ha SET affected_purok = :new WHERE affected_purok = :old
                            AND NOT EXISTS (SELECT 1 FROM hazard_alert_puroks hp WHERE hp.alert_id = ha.alert_id)",
        'evacuation_centers' => "UPDATE evacuation_centers SET purok = :new WHERE purok = :old",
    ] as $table => $sql) {
        $stmt = $conn->prepare($sql);
        $stmt->execute([':new' => $new_value, ':old' => $old_value]);
        $counts[$table] = $stmt->rowCount();
    }
    log_action($conn, "Purok values standardized",
        "\"$old_value\" -> \"$new_value\": households {$counts['households']}, hazard alerts {$counts['hazard_alerts']}, evacuation centers {$counts['evacuation_centers']}");
    $conn->commit();
} catch (Exception $e) {
    if ($conn->inTransaction()) $conn->rollBack();
    http_response_code(500);
    error_log("maintenance/apply_purok_mapping.php: " . $e->getMessage());
    echo json_encode(["success" => false, "message" => "We couldn't update the purok values. Please try again."]);
    exit();
}

$total = array_sum($counts);
echo json_encode([
    "success" => true,
    "message" => "Replaced \"$old_value\" with \"$new_value\" in $total record(s).",
    "counts" => $counts,
]);

<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';

require_login(['admin']);

$data = json_decode(file_get_contents("php://input"), true);
$household_id = intval($data['household_id'] ?? $_GET['household_id'] ?? 0);

if ($household_id <= 0) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "We couldn't identify this household. Please refresh the page and try again."]);
    exit();
}

$database = new Database();
$conn = $database->connect();

// Phase 16 — relief_allocations.household_id and
// distribution_beneficiaries.household_id were changed from ON DELETE
// CASCADE to ON DELETE RESTRICT (see
// database/migration_phase16_database_improvements.sql), so a household
// with any relief allocation or distribution/delivery history can no
// longer be deleted — deleting it used to silently erase that history
// along with it. household_members (ON DELETE CASCADE, unchanged) and
// disaster_reports.household_id (ON DELETE SET NULL, unchanged) are not
// affected — members are removed with the household as before, and any
// disaster report the household filed is kept, just unlinked.
$inUse = $conn->prepare(
    "SELECT
        (SELECT COUNT(*) FROM relief_allocations WHERE household_id = :household_id1) +
        (SELECT COUNT(*) FROM distribution_beneficiaries WHERE household_id = :household_id2) +
        (SELECT COUNT(*) FROM relief_requests WHERE household_id = :household_id3)
     AS usage_count"
);
// Phase 19: relief requests (and their feedback) are relief history too.
$inUse->execute([':household_id1' => $household_id, ':household_id2' => $household_id, ':household_id3' => $household_id]);
if (intval($inUse->fetchColumn()) > 0) {
    http_response_code(409);
    echo json_encode([
        "success" => false,
        "message" => "This household cannot be deleted because it has relief request, allocation or distribution records.",
    ]);
    exit();
}

try {
    $stmt = $conn->prepare("DELETE FROM households WHERE household_id = :household_id");
    $stmt->execute([':household_id' => $household_id]);
} catch (PDOException $e) {
    // Backstop: if some other reference blocks the delete at the database
    // level, report it cleanly instead of exposing the raw SQL/PDO error.
    if ($e->getCode() === '23000') {
        http_response_code(409);
        echo json_encode([
            "success" => false,
            "message" => "This household cannot be deleted because it has relief request, allocation or distribution records.",
        ]);
        exit();
    }
    http_response_code(500);
    echo json_encode(["success" => false, "message" => "We couldn't delete this household. Please try again."]);
    exit();
}

log_action($conn, "Household deleted", "household_id: $household_id");

echo json_encode(["success" => true, "message" => "Household deleted."]);

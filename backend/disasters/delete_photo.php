<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';

require_login(['admin', 'relief_personnel', 'field_officer']); // Phase 21: authorized personnel only

$data = json_decode(file_get_contents("php://input"), true);
$photo_id = intval($data['photo_id'] ?? 0);

if ($photo_id <= 0) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "The photo could not be found. Please refresh the page and try again."]);
    exit();
}

$database = new Database();
$conn = $database->connect();

$stmt = $conn->prepare(
    "SELECT rp.*, dr.user_id AS report_owner, dr.status
     FROM report_photos rp
     JOIN disaster_reports dr ON rp.report_id = dr.report_id
     WHERE rp.photo_id = :photo_id"
);
$stmt->execute([':photo_id' => $photo_id]);
$photo = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$photo) {
    http_response_code(404);
    echo json_encode(["success" => false, "message" => "Photo not found."]);
    exit();
}

// Relief Personnel may remove photos only from a Pending report they recorded.
field_require_report($conn, $photo['report_id']);
$is_owner = in_array($_SESSION['role'], ['relief_personnel', 'field_officer'], true) && intval($photo['report_owner']) === intval($_SESSION['user_id']);
$is_admin = $_SESSION['role'] === 'admin';

if (!$is_admin && !($is_owner && $photo['status'] === 'Pending')) {
    http_response_code(403);
    echo json_encode(["success" => false, "message" => "You do not have permission to delete this photo."]);
    exit();
}

// Assessment evidence is retained even after assignment changes or later submissions.
require_once __DIR__ . '/../lib/household_assessments.php';
$conn->beginTransaction();
$householdStmt = $conn->prepare('SELECT household_id FROM disaster_reports WHERE report_id=?');
$householdStmt->execute([$photo['report_id']]);
$evidenceHousehold = $householdStmt->fetchColumn();
if ($evidenceHousehold) ha_household($conn, intval($evidenceHousehold), true);
if (ha_report_evidence_locked($conn, intval($photo['report_id']))) {
    $conn->rollBack();
    http_response_code(409);
    echo json_encode(['success' => false, 'message' => 'Photos supporting household assessments are preserved as evidence.']);
    exit();
}

$file_path = __DIR__ . '/../' . $photo['file_path'];
if (file_exists($file_path)) {
    @unlink($file_path);
}

$conn->prepare("DELETE FROM report_photos WHERE photo_id = :photo_id")->execute([':photo_id' => $photo_id]);

log_action($conn, "Report photo deleted", "photo_id: $photo_id");

$conn->commit();
echo json_encode(["success" => true, "message" => "Photo deleted."]);

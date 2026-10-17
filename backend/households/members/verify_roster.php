<?php
require_once __DIR__ . '/../../config/cors.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../lib/household_profile.php';
require_once __DIR__ . '/../../lib/allocation_views.php';
require_login(['admin']);
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); echo json_encode(['success'=>false,'message'=>'Use POST.']); exit; }
$data = json_decode(file_get_contents('php://input'),true);
$id = $data['household_id'] ?? null;
if (!is_array($data) || ($data['confirm_complete'] ?? null) !== true || is_bool($id) || !is_scalar($id) || filter_var($id,FILTER_VALIDATE_INT) === false || $id <= 0) {
    http_response_code(400); echo json_encode(['success'=>false,'message'=>'Confirm that every person, including the head exactly once, is on this roster.']); exit;
}
$conn = (new Database())->connect();
$conn->beginTransaction();
$stmt = $conn->prepare('SELECT * FROM households WHERE household_id=? FOR UPDATE'); $stmt->execute([$id]); $household = $stmt->fetch(PDO::FETCH_ASSOC);
if (!$household) { $conn->rollBack(); http_response_code(404); echo json_encode(['success'=>false,'message'=>'Household not found.']); exit; }
// Validate all roster requirements before writing the attestation.
$household['roster_verified_at'] = date('Y-m-d H:i:s'); $household['roster_verified_by'] = $_SESSION['user_id'];
$profile = household_verified_profile($conn,$household);
if (!$profile['complete']) { $conn->rollBack(); http_response_code(400); echo json_encode(['success'=>false,'message'=>implode(' ',$profile['reasons']),'profile'=>$profile]); exit; }
$counts = array_fill_keys(HOUSEHOLD_VULNERABILITY_FLAGS,0);
foreach ($profile['people'] as $person) foreach ($counts as $key=>$value) $counts[$key] += (int)$person[$key];
$conn->prepare('UPDATE households SET roster_verified_at=?,roster_verified_by=?,number_of_members=?,vulnerable_members=?,children_count=?,seniors_count=?,pwd_count=?,pregnant_count=?,medical_needs_count=?,other_vulnerable_count=? WHERE household_id=?')->execute(array_merge([$household['roster_verified_at'],$_SESSION['user_id'],$profile['size'],$profile['vulnerable']],array_values($counts),[$id]));
log_action($conn,'Household roster verified','household_id: '.$id.', members: '.$profile['size'].', distinct vulnerable: '.$profile['vulnerable']);
$conn->commit();
$promotion = av_promote_after_change($conn, (int)$id, (int)$_SESSION['user_id']);
echo json_encode(['success'=>true,'message'=>'Household roster verified.','profile'=>$profile,'allocation_promoted'=>$promotion['promoted'] ?? false]);

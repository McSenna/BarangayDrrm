<?php
// Shared transaction for the three public member mutation routes.
require_once __DIR__ . '/../../config/cors.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../lib/household_profile.php';
require_login(['admin']);
if (!isset($member_operation)) { http_response_code(404); echo json_encode(['success'=>false,'message'=>'Route not found.']); exit; }
if (!in_array($_SERVER['REQUEST_METHOD'], $member_operation === 'add' ? ['POST'] : ($member_operation === 'update' ? ['PUT','POST'] : ['DELETE','POST']), true)) {
    http_response_code(405); echo json_encode(['success'=>false,'message'=>'Unsupported request method.']); exit;
}
$data = json_decode(file_get_contents('php://input'), true);
if ($data === null && $member_operation === 'delete') $data = [];
$conn = (new Database())->connect();
try {
    if (!is_array($data)) throw new InvalidArgumentException('Send a valid member record.');
    $rawId = $data[$member_operation === 'add' ? 'household_id' : 'member_id'] ?? ($member_operation === 'delete' ? ($_GET['member_id'] ?? null) : null);
    if (is_bool($rawId) || !is_scalar($rawId) || filter_var($rawId,FILTER_VALIDATE_INT) === false || (int)$rawId <= 0) throw new InvalidArgumentException('A valid household or member ID is required.');
    $id = (int)$rawId;
    $member = $member_operation === 'delete' ? null : household_member_payload($data);
    $conn->beginTransaction();
    if ($member_operation !== 'add') {
        $find = $conn->prepare('SELECT household_id FROM household_members WHERE member_id=?'); $find->execute([$id]);
        $householdId = $find->fetchColumn();
    } else $householdId = $id;
    $lock = $conn->prepare('SELECT household_id FROM households WHERE household_id=? FOR UPDATE'); $lock->execute([$householdId]);
    if (!$householdId || !$lock->fetchColumn()) {
        $conn->rollBack(); http_response_code(404); echo json_encode(['success'=>false,'message'=>'Household or member not found.']); exit;
    }
    if ($member !== null) household_assert_distinct_member($conn,(int)$householdId,$member,$member_operation === 'update' ? $id : 0);
    if ($member_operation === 'add') {
        $fields = array_keys($member);
        $sql = 'INSERT INTO household_members (household_id,'.implode(',',$fields).') VALUES ('.implode(',',array_fill(0,count($fields)+1,'?')).')';
        $conn->prepare($sql)->execute(array_merge([$householdId],array_values($member)));
        $id = (int)$conn->lastInsertId();
    } elseif ($member_operation === 'update') {
        $sql = 'UPDATE household_members SET '.implode(',',array_map(fn($field)=>$field.'=?',array_keys($member))).' WHERE member_id=?';
        $conn->prepare($sql)->execute(array_merge(array_values($member),[$id]));
    } else $conn->prepare('DELETE FROM household_members WHERE member_id=?')->execute([$id]);
    household_invalidate_roster($conn,(int)$householdId);
    log_action($conn,'Household member '.$member_operation,'household_id: '.$householdId.', member_id: '.$id);
    $conn->commit();
    http_response_code($member_operation === 'add' ? 201 : 200);
    echo json_encode(['success'=>true,'message'=>'Member saved. Verify the complete roster again before scoring.','member_id'=>$id]);
} catch (InvalidArgumentException $e) {
    if ($conn->inTransaction()) $conn->rollBack();
    http_response_code(400); echo json_encode(['success'=>false,'message'=>$e->getMessage()]);
}

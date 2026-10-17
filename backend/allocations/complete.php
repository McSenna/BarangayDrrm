<?php
// Relief Personnel complete a Ready allocation: the only place stock leaves the inventory for relief.
// Body: {allocation_id, completion_key, items:[{allocation_item_id, released_qty}], recipient_name?, remarks?, proof_photo?}
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../lib/allocation_workflow.php';
require_login(['relief_personnel']);
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); echo json_encode(['success' => false, 'message' => 'Method not allowed.']); exit; }
aw_endpoint(function () {
    $data = json_decode(file_get_contents('php://input'), true);
    if (!is_array($data)) aw_error('A JSON object is required.');
    $id = $data['allocation_id'] ?? null;
    if (!(is_int($id) || (is_string($id) && ctype_digit($id))) || (int)$id < 1) aw_error('Invalid allocation_id.');
    return aw_complete_distribution((new Database())->connect(), (int)$id, $data, intval($_SESSION['user_id']));
});

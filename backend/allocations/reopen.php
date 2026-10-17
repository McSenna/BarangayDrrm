<?php
// Administrator re-open: Ready → Assessment in Progress, visit unlocked. Body {allocation_id, reason}.
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../lib/allocation_views.php';
require_login(['admin']);
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); echo json_encode(['success' => false, 'message' => 'Method not allowed.']); exit; }
aw_endpoint(function () {
    $data = av_json_body();
    return aw_reopen((new Database())->connect(), av_id($data['allocation_id'] ?? null, 'allocation_id'), intval($_SESSION['user_id']), $data['reason'] ?? null);
});

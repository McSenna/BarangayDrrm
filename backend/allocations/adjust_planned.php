<?php
// Administrator override: raise planned quantities of a Ready allocation. Body {allocation_id, items:{item_id: qty}, reason}.
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../lib/allocation_views.php';
require_login(['admin']);
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); echo json_encode(['success' => false, 'message' => 'Method not allowed.']); exit; }
aw_endpoint(function () {
    $data = av_json_body();
    if (!is_array($data['items'] ?? null)) aw_error('Choose at least one item to change.');
    return aw_adjust_planned((new Database())->connect(), av_id($data['allocation_id'] ?? null, 'allocation_id'), $data['items'], intval($_SESSION['user_id']), $data['reason'] ?? null);
});

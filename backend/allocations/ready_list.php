<?php
// Ready for Distribution allocations only (Relief Personnel: their Purok). ?q=&purok=&priority=
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../lib/allocation_views.php';
require_login(['relief_personnel', 'admin']);
if ($_SERVER['REQUEST_METHOD'] !== 'GET') { http_response_code(405); echo json_encode(['success' => false, 'message' => 'Method not allowed.']); exit; }
aw_endpoint(function () {
    $db = (new Database())->connect();
    return av_ready_list($db, aw_actor($db, intval($_SESSION['user_id'])), $_GET);
});

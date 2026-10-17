<?php
// One allocation (?id=). Relief Personnel receive 404 for anything not Ready in their Purok.
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../lib/allocation_views.php';
require_login(['relief_personnel', 'admin']);
if ($_SERVER['REQUEST_METHOD'] !== 'GET') { http_response_code(405); echo json_encode(['success' => false, 'message' => 'Method not allowed.']); exit; }
aw_endpoint(function () {
    $db = (new Database())->connect();
    return av_detail($db, aw_actor($db, intval($_SESSION['user_id'])), av_id($_GET['id'] ?? null, 'id'));
});

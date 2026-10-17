<?php
// Status history / audit trail of one allocation (?id=).
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../lib/allocation_views.php';
require_login(['admin']);
if ($_SERVER['REQUEST_METHOD'] !== 'GET') { http_response_code(405); echo json_encode(['success' => false, 'message' => 'Method not allowed.']); exit; }
aw_endpoint(fn() => av_history((new Database())->connect(), av_id($_GET['id'] ?? null, 'id')));

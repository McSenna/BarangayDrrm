<?php
// Administrator starts a new allocation round after the previous one is Completed or Cancelled. Body {household_id}.
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../lib/allocation_views.php';
require_login(['admin']);
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); echo json_encode(['success' => false, 'message' => 'Method not allowed.']); exit; }
aw_endpoint(function () {
    $data = av_json_body();
    return aw_start_round((new Database())->connect(), av_id($data['household_id'] ?? null, 'household_id'), intval($_SESSION['user_id']));
});

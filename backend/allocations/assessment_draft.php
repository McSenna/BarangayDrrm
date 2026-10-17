<?php
// Assigned field officer saves an unfinished visit (allocation becomes ASSESSMENT_IN_PROGRESS).
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../lib/household_assessments.php';
require_login(['field_officer']);
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); echo json_encode(['success' => false, 'message' => 'Method not allowed.']); exit; }
ha_endpoint(function () {
    $data = json_decode(file_get_contents('php://input'), true);
    if (!is_array($data)) ha_error('A JSON object is required.');
    return ha_save_draft((new Database())->connect(), $data, intval($_SESSION['user_id']));
});

<?php
// Assigned field officer submits the visit: locked, scored on the server, and promoted to Ready in the same
// transaction when complete. Ready SMS are sent after the commit.
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../lib/household_assessments.php';
require_login(['field_officer']);
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); echo json_encode(['success' => false, 'message' => 'Method not allowed.']); exit; }
ha_endpoint(function () {
    $data = json_decode(file_get_contents('php://input'), true);
    if (!is_array($data)) ha_error('A JSON object is required.');
    $db = (new Database())->connect();
    $result = ha_submit($db, $data, intval($_SESSION['user_id']));
    if ($result['queued_sms_ids']) sms_process_queued($db, $result['queued_sms_ids'], intval(app_config('SMS_AUTO_TIMEOUT_SECONDS') ?: 8));
    unset($result['queued_sms_ids']);
    return $result;
});

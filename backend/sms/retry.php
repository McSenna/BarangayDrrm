<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/sms_helper.php';

require_login(['admin']);

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(["success" => false, "message" => "Method not allowed."]);
    exit();
}

$data = json_decode(file_get_contents("php://input"), true);
if (!is_array($data)) $data = [];
$raw = $data['sms_id'] ?? null;
$sms_id = (is_int($raw) || (is_string($raw) && preg_match('/^\s*\d+\s*$/', $raw))) ? intval($raw) : 0;
if ($sms_id <= 0) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "The SMS log entry could not be found. Please refresh the page."]);
    exit();
}

$state = sms_config_state();
if (!$state['ready']) {
    http_response_code(409);
    echo json_encode(["success" => false, "message" => SMS_DISABLED_MESSAGE . " Enable Semaphore first; nothing was sent."]);
    exit();
}

$conn = (new Database())->connect();
$phase20 = sms_logs_has_phase20_columns($conn);

try {
    $conn->beginTransaction();
    $stmt = $conn->prepare("SELECT * FROM sms_logs WHERE sms_id = :id FOR UPDATE");
    $stmt->execute([':id' => $sms_id]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        $conn->rollBack();
        http_response_code(404);
        echo json_encode(["success" => false, "message" => "The SMS log entry could not be found. Please refresh the page."]);
        exit();
    }
    if (in_array($row['status'], SMS_ACCEPTED_STATUSES, true)) {
        $conn->rollBack();
        http_response_code(409);
        echo json_encode(["success" => false, "message" => "This SMS was already accepted by the gateway. It will not be sent again."]);
        exit();
    }
    if (!sms_is_valid_ph_mobile($row['recipient_number'])) {
        $conn->rollBack();
        http_response_code(400);
        echo json_encode(["success" => false, "message" => "The recipient number is not a valid mobile number (09XXXXXXXXX), so it cannot be retried."]);
        exit();
    }

    $result = semaphore_send($state, [$row['recipient_number']], $row['message'], 15);
    $status = $result['ok'] ? sms_accepted_status($conn) : 'Failed';
    $p25 = sms_logs_phase25($conn);
    $update = $conn->prepare($phase20
        ? "UPDATE sms_logs SET status = :status, error_message = :error, provider_response = :resp,"
          . ($p25 ? " provider_message_id = :mid," : "") . "
                  attempts = attempts + 1, last_attempt_at = NOW() WHERE sms_id = :id"
        : "UPDATE sms_logs SET status = :status, error_message = :error WHERE sms_id = :id");
    $params = [':status' => $status, ':error' => $result['error'], ':id' => $sms_id];
    if ($phase20) $params[':resp'] = $result['response'];
    if ($phase20 && $p25) $params[':mid'] = $result['ok'] ? sms_provider_message_id($result['response']) : null;
    $update->execute($params);
    log_action($conn, "SMS retried", "sms_id: $sms_id, result: $status");
    $conn->commit();
} catch (Exception $e) {
    if ($conn->inTransaction()) $conn->rollBack();
    error_log("sms/retry.php: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(["success" => false, "message" => "We couldn't retry this SMS. Please try again."]);
    exit();
}

echo json_encode([
    "success" => $status !== 'Failed',
    "status" => $status,
    "message" => $status !== 'Failed'
        ? "SMS accepted by the gateway (delivery to the phone is not confirmed). The log entry was updated."
        : sms_failure_message($result['error']),
]);

<?php
// Offline regression checks; no gateway requests or SMS credits are used.
require_once __DIR__ . '/../backend/sms/sms_helper.php';
function check($condition, $message) {
    if (!$condition) { fwrite(STDERR, "FAIL: $message\n"); exit(1); }
}
check(function_exists('semaphore_parse_response'), 'Semaphore response parser exists');
check(function_exists('sms_failure_message'), 'Actionable SMS error mapper exists');
$senderFailure = sms_failure_message('Semaphore API returned HTTP 500: [{"senderName":"No active sender name found. Please apply for a sender name before sending messages."}]');
check(strpos($senderFailure, 'approved sender name') !== false, 'Missing sender explains account setup');
check(strpos($senderFailure, 'Semaphore dashboard') !== false, 'Missing sender gives next step');
check(strpos(sms_failure_message('secret provider internals'), 'secret provider internals') === false, 'Unknown provider error is not exposed');
$body = '[{"message_id":123,"status":"Queued"}]';
check(semaphore_parse_response(200, $body, '', 'private-key')['ok'], 'Queued message accepted');
check(!semaphore_parse_response(200, '[{"message_id":123,"status":"Failed"}]', '', 'private-key')['ok'], 'Failed message rejected');
check(!semaphore_parse_response(200, '{"error":"Invalid key"}', '', 'private-key')['ok'], 'API error rejected even with HTTP 200');
check(!semaphore_parse_response(200, 'invalid json', '', 'private-key')['ok'], 'Malformed response rejected');
check(!semaphore_parse_response(200, '[]', '', 'private-key')['ok'], 'Empty response rejected');
$failed = semaphore_parse_response(401, '{"error":"private-key"}', '', 'private-key');
check(strpos($failed['error'] . $failed['response'], 'private-key') === false, 'API key redacted');
check(sms_provider_message_id($body) === '123', 'Semaphore message ID extracted');
check(semaphore_number('+63 (912) 345-6789') === '639123456789', 'International number normalized');
check(semaphore_number('09123456789') === '639123456789', 'Local number normalized');
echo "Semaphore offline checks passed.\n";

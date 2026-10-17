<?php
// Offline checks: no credentials or real network requests are used.
require_once __DIR__ . '/../backend/sms/sms_helper.php';
function check($condition, $message) {
    if (!$condition) { fwrite(STDERR, "FAIL: $message\n"); exit(1); }
}
check(function_exists('httpsms_parse_response'), 'httpSMS response parser exists');
$body = '{"status":"success","data":{"id":"batch-123","recipientCount":1}}';
check(httpsms_parse_response(200, $body, '', 'private-key')['ok'], 'Queued batch accepted');
foreach (['invalid json', '[]', '{"data":{"success":false,"smsBatchId":"id"}}', '{"data":{"success":true}}', '{"data":{"success":"true","smsBatchId":"id"}}', '{"status":"success","data":{"id":[]}}'] as $bad) {
    check(!httpsms_parse_response(200, $bad, '', 'private-key')['ok'], 'Invalid payload rejected');
}
check(!httpsms_parse_response(401, $body, '', 'private-key')['ok'], 'HTTP failure rejected');
check(!httpsms_parse_response(200, false, 'timeout', 'private-key')['ok'], 'Transport failure rejected');
$failed = httpsms_parse_response(401, '{"error":"private-key"}', 'private-key failed', 'private-key');
check(strpos($failed['error'] . $failed['response'], 'private-key') === false, 'API key redacted');
check(sms_provider_message_id($body) === 'batch-123', 'Batch ID extracted');
$long = json_encode(['status' => 'success', 'data' => ['message' => str_repeat('x', 400), 'id' => 'late-id']]);
check(sms_provider_message_id(httpsms_parse_response(200, $long, '', '')['response']) === 'late-id', 'Batch ID survives response shortening');
foreach (['09123456789', '639123456789', '+63 (912) 345-6789'] as $number) {
    check(httpsms_number($number) === '+639123456789', 'E.164 normalization');
}
putenv('HTTPSMS_SMS_ENABLED=false'); putenv('HTTPSMS_API_KEY=test-key');
check(!sms_config_state()['ready'], 'Disabled configuration cannot send');
putenv('HTTPSMS_SMS_ENABLED=true'); putenv('HTTPSMS_API_KEY=   ');
check(!sms_config_state()['ready'], 'Missing key cannot send');
putenv('HTTPSMS_API_KEY= test-key '); putenv('HTTPSMS_FROM= +639171234567 ');
$state = sms_config_state();
check($state['ready'] && $state['api_key'] === 'test-key' && $state['from'] === '+639171234567', 'Configured values trimmed');
check(strpos(sms_failure_message('private provider details'), 'private provider details') === false, 'Raw provider errors remain private');
check(SMS_ACCEPTED_STATUSES === ['Sent', 'Accepted by Gateway', 'Delivered'], 'Historical accepted statuses retained');
echo "httpSMS offline checks passed.\n";


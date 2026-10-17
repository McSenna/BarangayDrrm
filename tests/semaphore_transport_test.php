<?php
// Run with php -n to replace cURL with an offline recording transport.
if (extension_loaded('curl')) { fwrite(STDERR, "Run this test with php -n.\n"); exit(1); }
foreach (['CURLOPT_RETURNTRANSFER', 'CURLOPT_TIMEOUT', 'CURLOPT_CONNECTTIMEOUT', 'CURLOPT_POST', 'CURLOPT_HTTPHEADER', 'CURLOPT_POSTFIELDS', 'CURLINFO_HTTP_CODE'] as $i => $name) define($name, $i + 1);
if (!function_exists('mb_substr')) { function mb_substr($s, $start, $length) { return substr($s, $start, $length); } }
if (!extension_loaded('curl')) {
function curl_init($url) { $GLOBALS['request_url'] = $url; return new stdClass(); }
function curl_setopt($ch, $key, $value) { $GLOBALS['request_options'][$key] = $value; }
function curl_exec($ch) { return '[{"message_id":42,"status":"Pending"}]'; }
function curl_getinfo($ch, $key) { return 200; }
function curl_error($ch) { return ''; }
function curl_close($ch) {}
}
require_once __DIR__ . '/../backend/sms/sms_helper.php';
function check($condition, $message) {
    if (!$condition) { fwrite(STDERR, "FAIL: $message\n"); exit(1); }
}
$state = ['api_key' => 'dummy-key', 'sender_name' => '', 'base_url' => 'https://api.semaphore.co/api/v4/messages'];
$result = semaphore_send($state, ['09123456789', '+639987654321'], 'Relief is ready & available.', 8);
parse_str($GLOBALS['request_options'][CURLOPT_POSTFIELDS], $body);
check($GLOBALS['request_url'] === $state['base_url'], 'Semaphore endpoint');
check($body['apikey'] === 'dummy-key', 'API key in form body');
check($body['number'] === '639123456789,639987654321', 'Comma separated normalized numbers');
check($body['message'] === 'Relief is ready & available.', 'Message encoding preserved');
check(!isset($body['sendername']), 'Default sender omitted');
check($result['ok'], 'Accepted response');
$state['sender_name'] = 'Barangay';
semaphore_send($state, ['09123456789'], 'Relief is ready.', 8);
parse_str($GLOBALS['request_options'][CURLOPT_POSTFIELDS], $body);
check($body['sendername'] === 'Barangay', 'Optional sender included');
echo "Semaphore offline transport checks passed.\n";

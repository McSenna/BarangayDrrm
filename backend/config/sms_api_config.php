<?php
require_once __DIR__ . '/app_config.php';
$sms_env = function ($key) {
    $value = getenv($key);
    return $value !== false && $value !== '' ? $value : app_config($key);
};
return [
    'SMS_ENABLED' => filter_var($sms_env('HTTPSMS_SMS_ENABLED') ?? false, FILTER_VALIDATE_BOOLEAN),
    'API_KEY' => (string) ($sms_env('HTTPSMS_API_KEY') ?? ''),
    'FROM' => (string) ($sms_env('HTTPSMS_FROM') ?? ''),
    'API_BASE_URL' => 'https://api.httpsms.com/v1/messages/send',
];

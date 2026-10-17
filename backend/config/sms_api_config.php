<?php

require_once __DIR__ . '/app_config.php';

$sms_env = function ($key) {
    $value = getenv($key);
    if ($value !== false && $value !== '') return $value;
    return app_config($key);
};

return [
    'SMS_ENABLED' => filter_var($sms_env('SEMAPHORE_SMS_ENABLED') ?? false, FILTER_VALIDATE_BOOLEAN),
    'API_KEY' => (string) ($sms_env('SEMAPHORE_API_KEY') ?? ''),
    'SENDER_NAME' => (string) ($sms_env('SEMAPHORE_SENDER_NAME') ?? ''),
    'API_BASE_URL' => 'https://api.semaphore.co/api/v4/messages',
];

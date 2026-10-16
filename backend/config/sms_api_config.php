<?php

require_once __DIR__ . '/app_config.php';

$sms_env = function ($key) {
    $value = getenv($key);
    if ($value !== false && $value !== '') return $value;
    return app_config($key);
};

return [
    'SMS_ENABLED' => filter_var($sms_env('TEXTBEE_SMS_ENABLED') ?? false, FILTER_VALIDATE_BOOLEAN),  // or set to true once you have a textbee.dev API key + device configured
    'API_KEY' => (string) ($sms_env('TEXTBEE_API_KEY') ?? ''),    
    'DEVICE_ID' => (string) ($sms_env('TEXTBEE_DEVICE_ID') ?? ''), // or paste your textbee.dev device ID here
    'API_BASE_URL' => (string) ($sms_env('TEXTBEE_API_BASE_URL') ?? 'https://api.textbee.dev/api/v1/gateway'),
];

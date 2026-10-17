<?php
/**
 * PRODUCTION (Hostinger) configuration template.
 *
 * 1. Copy this file to app_config.local.php in the same folder.
 * 2. Fill in the database details from hPanel → Databases → MySQL Databases.
 * 3. Put your real HTTPS domain in CORS_ALLOWED_ORIGINS.
 *
 * app_config.local.php is excluded from the project ZIP and must never be
 * shared — it contains the database password.
 */
return [
    'APP_ENV' => 'production',
    'DB_HOST' => 'localhost',
    'DB_NAME' => 'u000000000_binitayan',
    'DB_USER' => 'u000000000_binitayan',
    'DB_PASS' => 'change-me',
    // httpSMS gateway; FROM is the Android phone number in +63 format.
    'HTTPSMS_SMS_ENABLED' => false,
    'HTTPSMS_API_KEY' => '',
    'HTTPSMS_FROM' => '',
    'CORS_ALLOWED_ORIGINS' => [
        'https://your-domain.example',
        'https://www.your-domain.example',
    ],
];


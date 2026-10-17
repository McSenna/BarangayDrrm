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
    // Semaphore SMS gateway; blank sender uses the account's registered default.
    'SEMAPHORE_SMS_ENABLED' => false,
    'SEMAPHORE_API_KEY' => '',
    'SEMAPHORE_SENDER_NAME' => '',
    'CORS_ALLOWED_ORIGINS' => [
        'https://your-domain.example',
        'https://www.your-domain.example',
    ],
];

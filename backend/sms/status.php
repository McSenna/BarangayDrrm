<?php
/**
 * Phase 20 — is automatic/manual SMS currently able to send?
 * Returns only booleans and a message; never the API key or device ID.
 */
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/sms_helper.php';

require_login(['admin']);

$state = sms_config_state();
echo json_encode([
    "success" => true,
    "enabled" => $state['ready'],
    "message" => $state['ready']
        ? "SMS notifications are enabled (httpSMS)."
        : SMS_DISABLED_MESSAGE . " Automatic and manual SMS are recorded in SMS Logs as \"Not Configured\" and nothing is sent.",
]);


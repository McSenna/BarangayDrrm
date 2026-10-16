<?php
/**
 * Central backend configuration (Phase 19).
 *
 * One place for everything that differs between LOCAL (XAMPP) and
 * PRODUCTION (Hostinger): database credentials, allowed CORS origins and the
 * environment name. Nothing here is ever sent to the browser.
 *
 * Precedence (highest first):
 *   1. Environment variables (APP_ENV, DB_HOST, DB_NAME, DB_USER, DB_PASS,
 *      CORS_ALLOWED_ORIGINS as a comma-separated list)
 *   2. backend/config/app_config.local.php  (optional, NOT committed/zipped —
 *      copy app_config.local.example.php and fill in production values)
 *   3. The local XAMPP defaults below (unchanged from the original project,
 *      so the current local setup keeps working with no extra step)
 *
 * This folder is protected by backend/config/.htaccess (no direct web access).
 */

if (!function_exists('app_config')) {
    function app_config($key = null)
    {
        static $config = null;

        if ($config === null) {
            $config = [
                'APP_ENV' => 'local',
                'DB_HOST' => 'localhost',
                'DB_NAME' => 'barangay_disaster_db',
                'DB_USER' => 'root',
                'DB_PASS' => '', // default XAMPP MySQL password is empty
                // Vite dev server + XAMPP Apache serving a production build locally.
                // 5174 is where Vite moves when 5173 is already taken (e.g. a second
                // dev server), so both work. Exact origins only — never "*", because
                // requests carry the PHP session cookie.
                'CORS_ALLOWED_ORIGINS' => [
                    'http://localhost:5173',
                    'http://127.0.0.1:5173',
                    'http://localhost:5174',
                    'http://127.0.0.1:5174',
                    'http://localhost',
                    'http://127.0.0.1',
                ],
                // Philippine time for PHP dates and MySQL NOW()/CURRENT_TIMESTAMP,
                // so timestamps are correct even on a UTC server (Hostinger).
                'APP_TIMEZONE' => 'Asia/Manila',
                'DB_TIME_ZONE' => '+08:00',
                // Automatic (event-triggered) SMS use a shorter timeout than the
                // manual Send SMS page so a slow gateway never stalls the action.
                'SMS_AUTO_TIMEOUT_SECONDS' => 8,
                // Phase 25 (audit F-SMS-01): relief SMS go out only when an allocation is
                // marked Ready for Distribution. Approval, request decisions and
                // distribution create in-app notices only. Set true in
                // app_config.local.php ONLY if the barangay approves texting at those steps.
                'SMS_ON_APPROVAL_AND_DISTRIBUTION' => false,
                // Phase 25: server-side idle logout (minutes) and login throttling.
                'SESSION_IDLE_MINUTES' => 30,
                'LOGIN_MAX_FAILURES' => 8,
                'LOGIN_LOCK_MINUTES' => 15,
            ];

            $local_file = __DIR__ . '/app_config.local.php';
            if (is_file($local_file)) {
                $local = require $local_file;
                if (is_array($local)) {
                    $config = array_merge($config, $local);
                }
            }

            foreach (['APP_ENV', 'DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASS'] as $env_key) {
                $value = getenv($env_key);
                if ($value !== false && $value !== '') {
                    $config[$env_key] = $value;
                }
            }
            // Opt-in policy switch (Phase 25): only the exact value "true" enables it.
            $sms_policy = getenv('SMS_ON_APPROVAL_AND_DISTRIBUTION');
            if ($sms_policy !== false && $sms_policy !== '') {
                $config['SMS_ON_APPROVAL_AND_DISTRIBUTION'] = strtolower(trim($sms_policy)) === 'true';
            }
            $origins = getenv('CORS_ALLOWED_ORIGINS');
            if ($origins !== false && trim($origins) !== '') {
                $config['CORS_ALLOWED_ORIGINS'] = array_map('trim', explode(',', $origins));
            }
            if (!is_array($config['CORS_ALLOWED_ORIGINS'])) {
                $config['CORS_ALLOWED_ORIGINS'] = array_map('trim', explode(',', (string) $config['CORS_ALLOWED_ORIGINS']));
            }
        }

        return $key === null ? $config : ($config[$key] ?? null);
    }
}

if (function_exists('app_config') && !defined('APP_TIMEZONE_SET')) {
    define('APP_TIMEZONE_SET', true);
    $__tz = app_config('APP_TIMEZONE');
    if ($__tz && in_array($__tz, timezone_identifiers_list(), true)) {
        date_default_timezone_set($__tz);
    }
}

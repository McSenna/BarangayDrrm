<?php
// Local-development convenience command only. Production uses the reviewed SQL migration.
if (PHP_SAPI !== 'cli') { http_response_code(403); exit(); }
require_once __DIR__ . '/../backend/config/database.php';
if (app_config('APP_ENV') !== 'local' || !in_array(app_config('DB_HOST'), ['localhost', '127.0.0.1', '::1'], true)) {
    fwrite(STDERR, "This command only applies migrations to a local development database.\n");
    exit(1);
}
$conn = (new Database())->connect();
$before = intval($conn->query('SELECT COUNT(*) FROM users')->fetchColumn());
$conn->exec(file_get_contents(__DIR__ . '/migration_phase26_registration_requests.sql'));
$after = intval($conn->query('SELECT COUNT(*) FROM users')->fetchColumn());
if ($before !== $after) { fwrite(STDERR, "Unexpected account count change.\n"); exit(1); }
echo "Registration-request migration applied to local database. $after existing accounts preserved.\n";

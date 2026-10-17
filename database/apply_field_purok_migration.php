<?php
if (PHP_SAPI !== 'cli') { http_response_code(403); exit(); }
require_once __DIR__ . '/../backend/config/database.php';
if (app_config('APP_ENV') !== 'local' || !in_array(app_config('DB_HOST'), ['localhost', '127.0.0.1', '::1'], true)) {
    fwrite(STDERR, "This command is restricted to local development databases.\n"); exit(1);
}
$conn = (new Database())->connect();
$before = $conn->query('SELECT user_id, role, is_active FROM users ORDER BY user_id')->fetchAll(PDO::FETCH_ASSOC);
$column = $conn->query("SHOW COLUMNS FROM users LIKE 'assigned_purok'")->fetch(PDO::FETCH_ASSOC);
if (!$column) $conn->exec('ALTER TABLE users ADD COLUMN assigned_purok VARCHAR(50) NULL DEFAULT NULL');
$after = $conn->query('SELECT user_id, role, is_active FROM users ORDER BY user_id')->fetchAll(PDO::FETCH_ASSOC);
if ($before !== $after) { fwrite(STDERR, "Existing accounts changed unexpectedly.\n"); exit(1); }
echo 'Purok assignment migration applied locally; ' . count($after) . " existing accounts preserved.\n";

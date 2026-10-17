<?php
// Local-development convenience command only. Production uses the reviewed SQL migration.
// Usage: C:/xampp/php/php.exe database/apply_barangay_alerts_migration.php
if (PHP_SAPI !== 'cli') { http_response_code(403); exit(); }
require_once __DIR__ . '/../backend/config/database.php';
if (app_config('APP_ENV') !== 'local' || !in_array(app_config('DB_HOST'), ['localhost', '127.0.0.1', '::1'], true)) {
    fwrite(STDERR, "This command only applies migrations to a local development database.\n");
    exit(1);
}
$conn = (new Database())->connect();
$before = intval($conn->query('SELECT COUNT(*) FROM hazard_alerts')->fetchColumn());
$conn->exec(file_get_contents(__DIR__ . '/migration_phase33_barangay_alerts.sql'));
$after = intval($conn->query('SELECT COUNT(*) FROM hazard_alerts')->fetchColumn());
if ($before !== $after) { fwrite(STDERR, "Unexpected alert count change.\n"); exit(1); }
$states = $conn->query("SELECT alert_status, COUNT(*) FROM hazard_alerts GROUP BY alert_status")->fetchAll(PDO::FETCH_KEY_PAIR);
echo "Barangay alerts migration applied to local database. $after existing alerts preserved: " . json_encode($states) . "\n";

<?php
// Creates a NEW isolated database only. Never reads or resets application data.
if (PHP_SAPI !== 'cli') exit(1);
$db = 'codex_users_test_' . date('Ymd_His') . '_' . bin2hex(random_bytes(3));
$pdo = new PDO('mysql:host=127.0.0.1;charset=utf8mb4', getenv('DB_USER') ?: 'root', getenv('DB_PASS') ?: '', [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$pdo->exec("CREATE DATABASE `$db` CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci");
$pdo->exec("USE `$db`");
$schemaFile = getenv('USER_TEST_FULL_SCHEMA') ? 'barangay_disaster_db_FINAL.sql' : 'barangay_disaster_db.sql';
$schema = file_get_contents(__DIR__ . '/../database/' . $schemaFile);
$schema = preg_replace('/CREATE DATABASE IF NOT EXISTS barangay_disaster_db\s+CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;/i', '', $schema);
$schema = str_replace('USE barangay_disaster_db;', '', $schema);
$pdo->exec($schema);
$pdo->exec(file_get_contents(__DIR__ . '/../database/migration_phase27_field_officer.sql'));
$pdo->exec(file_get_contents(__DIR__ . '/../database/migration_phase28_field_officer_purok.sql'));
if (!getenv('SKIP_REGISTRATION_MIGRATION')) $pdo->exec(file_get_contents(__DIR__ . '/../database/migration_phase26_registration_requests.sql'));
foreach (['migration_phase29_household_assessments.sql','migration_phase30_verified_household_members.sql','migration_phase31_verified_flood_scoring.sql','migration_phase32_relief_allocation_workflow.sql'] as $migration) {
    $pdo->exec(file_get_contents(__DIR__ . '/../database/' . $migration));
}
$password = bin2hex(random_bytes(12));
$insert = $pdo->prepare('INSERT INTO users (full_name,email,password,role,is_active) VALUES (?,?,?,?,?)');
foreach ([['Test Administrator', 'admin@example.test', 'admin', 1], ['Second Administrator', 'second@example.test', 'admin', 1], ['Test Resident', 'resident@example.test', 'resident', 1], ['Test Personnel', 'personnel@example.test', 'relief_personnel', 1], ['Inactive User', 'inactive@example.test', 'resident', 0]] as [$name,$email,$role,$active]) {
    $insert->execute([$name,$email,password_hash($password,PASSWORD_DEFAULT),$role,$active]);
}
$pdo->exec("UPDATE users SET assigned_purok='Purok 3' WHERE role='relief_personnel'");
$pdo->exec("INSERT INTO households (user_id,head_of_family,purok,address) SELECT user_id,'Test household','Purok 3','Test street' FROM users WHERE email='resident@example.test'");
echo json_encode(['database' => $db, 'password' => $password]);

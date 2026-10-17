<?php
// Phase 32 migration: allocation tables, per-round assessments, ledger columns, legacy cancel.
// Uses a NEW isolated fixture database only (tests/user_management_fixture.php) and drops it afterwards.
if (PHP_SAPI !== 'cli') exit(1);
$php = PHP_BINARY;
putenv('USER_TEST_FULL_SCHEMA=1');
$fixture = json_decode(shell_exec(escapeshellarg($php) . ' ' . escapeshellarg(__DIR__ . '/user_management_fixture.php')), true);
if (!is_array($fixture) || !preg_match('/^codex_users_test_\d{8}_\d{6}_[a-f0-9]+$/', $fixture['database'] ?? '')) { fwrite(STDERR, "fixture failed\n"); exit(1); }
$db = new PDO('mysql:host=127.0.0.1;dbname=' . $fixture['database'] . ';charset=utf8mb4', getenv('DB_USER') ?: 'root', getenv('DB_PASS') ?: '', [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$migration = file_get_contents(__DIR__ . '/../database/migration_phase32_relief_allocation_workflow.sql');
$checks = 0;
function check($ok, $label) { global $checks; if (!$ok) throw new RuntimeException('FAIL ' . $label); $checks++; }
function raises(callable $fn, string $needle, string $label) { try { $fn(); } catch (PDOException $e) { check(stripos($e->getMessage(), $needle) !== false, "$label ({$e->getMessage()})"); return; } check(false, "$label (no error)"); }
try {
    $db->exec("INSERT INTO relief_items (item_name, category, quantity, unit) VALUES ('Rice 5kg','Food',10,'sack')");
    $item = (int)$db->lastInsertId();
    $hid = (int)$db->query('SELECT household_id FROM households LIMIT 1')->fetchColumn();
    $db->exec("INSERT INTO relief_allocations (household_id,item_id,quantity,status,allocation_date) VALUES ($hid,$item,1,'Approved',CURDATE()),($hid,$item,2,'Distributed',CURDATE())");
    [$approved, $distributed] = array_map('intval', $db->query('SELECT allocation_id FROM relief_allocations ORDER BY allocation_id')->fetchAll(PDO::FETCH_COLUMN));

    $db->exec($migration);
    $counts = fn() => array_map('intval', $db->query('SELECT (SELECT COUNT(*) FROM household_allocations),(SELECT COUNT(*) FROM household_allocation_history),(SELECT COUNT(*) FROM audit_logs)')->fetch(PDO::FETCH_NUM));
    $afterFirst = $counts();
    $db->exec($migration);
    check($counts() === $afterFirst, 'second run adds no rows');

    $households = (int)$db->query('SELECT COUNT(*) FROM households')->fetchColumn();
    $open = $db->query("SELECT household_id, COUNT(*) n FROM household_allocations WHERE status NOT IN ('COMPLETED','CANCELLED') GROUP BY household_id")->fetchAll(PDO::FETCH_KEY_PAIR);
    check(count($open) === $households && max($open) === 1, 'exactly one open allocation per household');
    check($db->query("SELECT status FROM household_allocations WHERE household_id=$hid")->fetchColumn() === 'PENDING_ASSESSMENT', 'seeded as PENDING_ASSESSMENT');
    check((int)$db->query("SELECT COUNT(*) FROM household_allocation_history WHERE action='seed'")->fetchColumn() === $households, 'seed history row per household');

    $legacy = $db->query("SELECT status, cancel_reason FROM relief_allocations WHERE allocation_id=$approved")->fetch(PDO::FETCH_ASSOC);
    check($legacy['status'] === 'Cancelled' && $legacy['cancel_reason'] === 'Replaced by the new allocation workflow', 'legacy Approved cancelled with the exact reason');
    check($db->query("SELECT status FROM relief_allocations WHERE allocation_id=$distributed")->fetchColumn() === 'Distributed', 'legacy Distributed untouched');
    check((int)$db->query("SELECT COUNT(*) FROM audit_logs WHERE action='Legacy allocations cancelled'")->fetchColumn() === 1, 'one audit row for the legacy cancel');
    check((int)$db->query("SELECT quantity FROM relief_items WHERE item_id=$item")->fetchColumn() === 10, 'legacy cancel changes no stock');

    raises(fn() => $db->exec("UPDATE relief_items SET quantity=-1 WHERE item_id=$item"), 'chk_relief_items_quantity', 'negative stock rejected by CHECK');
    raises(fn() => $db->exec("INSERT INTO household_allocations (household_id, round_no, status) VALUES ($hid, 2, 'PENDING_ASSESSMENT')"), 'Duplicate', 'second open allocation rejected');
    $db->exec("UPDATE household_allocations SET status='CANCELLED', cancel_reason='test' WHERE household_id=$hid");
    $db->exec("INSERT INTO household_allocations (household_id, round_no, status) VALUES ($hid, 2, 'PENDING_ASSESSMENT')");
    check(true, 'new round allowed once the previous allocation is closed');

    foreach ([['household_field_assessments', 'allocation_id'], ['household_field_assessments', 'damage_classification'], ['household_field_assessments', 'locked_at'],
              ['household_field_assessments', 'draft_saved_at'], ['household_field_assessments', 'reopened_count'], ['inventory_logs', 'previous_quantity'],
              ['inventory_logs', 'allocation_ref'], ['household_allocations', 'completion_key'], ['household_allocation_items', 'released_qty']] as [$t, $c]) {
        check((bool)$db->query("SHOW COLUMNS FROM $t LIKE '$c'")->fetch(), "$t.$c exists");
    }
    $uniqueHousehold = $db->query("SHOW INDEX FROM household_field_assessments WHERE Column_name='household_id' AND Non_unique=0")->fetch();
    check(!$uniqueHousehold, 'assessments are no longer one per household');
    check($db->query("SELECT setting_value FROM system_settings WHERE setting_key='standard_relief_package_id'")->fetchColumn() === '', 'standard package setting present and empty');
    echo "PASS allocation migration ($checks checks)\n";
} finally {
    (new PDO('mysql:host=127.0.0.1;charset=utf8mb4', getenv('DB_USER') ?: 'root', getenv('DB_PASS') ?: ''))->exec('DROP DATABASE `' . $fixture['database'] . '`');
}

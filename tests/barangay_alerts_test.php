<?php
// Barangay alert lifecycle (backend/lib/barangay_alerts.php) against a NEW isolated fixture database:
// Draft → Active → Inactive, validation, idempotent turn-off, history, public filtering, legacy rows, migration re-run.
// Usage: C:/xampp/php/php.exe tests/barangay_alerts_test.php
if (PHP_SAPI !== 'cli') exit(1);
require_once __DIR__ . '/../backend/lib/barangay_alerts.php';
putenv('USER_TEST_FULL_SCHEMA=1');
$fixture = json_decode(shell_exec(escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg(__DIR__ . '/user_management_fixture.php')), true);
if (!preg_match('/^codex_users_test_\d{8}_\d{6}_[a-f0-9]+$/', $fixture['database'] ?? '')) { fwrite(STDERR, "fixture failed\n"); exit(1); }
$db = new PDO('mysql:host=127.0.0.1;dbname=' . $fixture['database'] . ';charset=utf8mb4', getenv('DB_USER') ?: 'root', getenv('DB_PASS') ?: '', [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$db->exec("SET time_zone = '+08:00'");
$checks = 0;
function check($ok, $label) { global $checks; if (!$ok) throw new RuntimeException('FAIL ' . $label); $checks++; echo "PASS $label\n"; }
function refused(callable $fn, int $code, string $label) {
    try { $fn(); } catch (BarangayAlertError $e) { check($e->getCode() === $code, "$label (got {$e->getCode()} {$e->getMessage()})"); return; }
    check(false, "$label (no error)");
}
$one = fn(string $sql) => $db->query($sql)->fetchColumn();
$ddl = fn(string $table) => $db->query("SHOW CREATE TABLE $table")->fetch(PDO::FETCH_NUM)[1];
$migration = file_get_contents(__DIR__ . '/../database/migration_phase33_barangay_alerts.sql');
try {
    // Legacy row inserted BEFORE the migration (as the seed scripts do): backfilled into the new model.
    $db->exec("INSERT INTO hazard_alerts (hazard_type,status,title,affected_purok,is_active,issued_at) VALUES ('Flood','Alert','Legacy pre-migration','7',1,'2026-09-29 06:00:00')");
    $preId = (int)$db->lastInsertId();
    $db->exec($migration);
    $schemaOnce = $ddl('hazard_alerts') . $ddl('hazard_alert_history') . $ddl('hazard_alert_puroks') . $one("SELECT COUNT(*) FROM hazard_alert_history") . $one("SELECT COUNT(*) FROM hazard_alert_puroks");
    $db->exec($migration);
    $schemaTwice = $ddl('hazard_alerts') . $ddl('hazard_alert_history') . $ddl('hazard_alert_puroks') . $one("SELECT COUNT(*) FROM hazard_alert_history") . $one("SELECT COUNT(*) FROM hazard_alert_puroks");
    check($schemaOnce === $schemaTwice, 'migration is repeatable (second run changes nothing)');
    $pre = ba_get($db, $preId);
    check($pre['alert_status'] === 'Active' && $pre['puroks'] === ['Purok 7'] && $pre['scope'] === 'puroks', 'pre-migration legacy row: Active, "7" read as Purok 7');
    check((int)$one("SELECT COUNT(*) FROM hazard_alert_history WHERE alert_id=$preId AND action='activated'") === 1, 'legacy activation backfilled into history once');

    $admin = (int)$one("SELECT user_id FROM users WHERE email='admin@example.test'");
    $second = (int)$one("SELECT user_id FROM users WHERE email='second@example.test'");
    $base = ['title' => 'Rising water along the river', 'hazard_type' => 'Flood', 'severity' => 'Warning',
             'description' => 'Water is rising.', 'instructions' => 'Move to higher ground.', 'scope' => 'puroks', 'puroks' => ['Purok 3', 'Purok 1']];

    // ---- validation
    foreach ([['Purok 8'], ['Purok 5'], ['0'], ['Purok 1', 'Riverside'], [7]] as $bad) refused(fn() => ba_create($db, [...$base, 'puroks' => $bad], $admin), 400, 'reject puroks ' . json_encode($bad));
    refused(fn() => ba_create($db, [...$base, 'puroks' => []], $admin), 400, 'selected puroks scope needs at least one purok');
    refused(fn() => ba_create($db, [...$base, 'scope' => 'barangay'], $admin), 400, 'barangay-wide scope must not list puroks');
    refused(fn() => ba_create($db, [...$base, 'scope' => 'street'], $admin), 400, 'unknown scope rejected');
    refused(fn() => ba_create($db, [...$base, 'severity' => 'Alert'], $admin), 400, 'legacy severity "Alert" not accepted for new alerts');
    refused(fn() => ba_create($db, [...$base, 'hazard_type' => 'Tsunami'], $admin), 400, 'unknown type rejected');
    refused(fn() => ba_create($db, [...$base, 'title' => '  '], $admin), 400, 'title required');
    refused(fn() => ba_create($db, [...$base, 'alert_status' => 'Active'], $admin), 400, 'status cannot be set through create');
    refused(fn() => ba_create($db, [...$base, 'is_active' => 1], $admin), 400, 'is_active cannot be set through create');
    refused(fn() => ba_create($db, [...$base, 'title' => str_repeat('x', 151)], $admin), 400, 'title longer than 150 rejected');

    // ---- create (draft)
    $id = ba_create($db, $base, $admin);
    $a = ba_get($db, $id);
    check($a['alert_status'] === 'Draft' && (int)$a['is_active'] === 0 && $a['issued_at'] === null, 'created as Draft, not active, no activation time');
    check($a['puroks'] === ['Purok 1', 'Purok 3'], 'puroks stored de-duplicated in standard order');
    check((int)$a['created_by'] === $admin && (int)$a['updated_by'] === $admin, 'created by / updated by recorded');
    check(!in_array($id, array_column(ba_public_active($db), 'alert_id'), true), 'draft is not public');
    refused(fn() => ba_deactivate($db, $id, $admin, null), 409, 'draft cannot be turned off');

    // ---- edit draft (version check)
    $a = ba_update($db, $id, [...$base, 'severity' => 'Critical', 'version' => $a['version']], $second);
    check($a['severity'] === 'Critical' && (int)$a['updated_by'] === $second && $a['alert_status'] === 'Draft', 'draft edited by second admin, still Draft');
    refused(fn() => ba_update($db, $id, [...$base, 'version' => 1], $admin), 409, 'stale version refused');
    refused(fn() => ba_update($db, $id, [...$base, 'version' => $a['version'], 'alert_status' => 'Inactive'], $admin), 400, 'status cannot be changed through edit');

    // ---- activate
    $r = ba_activate($db, $id, $admin);
    $a = $r['alert'];
    check(!$r['already'] && $a['alert_status'] === 'Active' && (int)$a['is_active'] === 1 && $a['issued_at'] !== null && (int)$a['issued_by'] === $admin, 'activated: Active, time and actor recorded');
    check(ba_activate($db, $id, $admin)['already'] === true, 'activating again is a no-op');
    check((int)$one("SELECT COUNT(*) FROM hazard_alert_history WHERE alert_id=$id AND action='activated'") === 1, 'one activation history entry');
    check(ba_history($db, $id)[0]['action'] === 'created', 'history starts with created');

    // ---- public listing: resident-facing fields only
    $pub = array_values(array_filter(ba_public_active($db), fn($x) => $x['alert_id'] === $id))[0] ?? null;
    check($pub && $pub['severity'] === 'Critical' && $pub['puroks'] === ['Purok 1', 'Purok 3'] && $pub['instructions'] === 'Move to higher ground.', 'active alert is public with severity, puroks, instructions');
    check(preg_match('/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\+08:00$/', $pub['activated_at']) === 1, 'activation time is ISO 8601 with +08:00');
    $leak = array_intersect(array_keys($pub), ['created_by', 'updated_by', 'issued_by', 'resolution_note', 'version', 'issued_by_name', 'created_by_name']);
    check($leak === [], 'public alert carries no actor or internal fields');

    // ---- edit an active alert: changed fields recorded
    $a = ba_update($db, $id, [...$base, 'severity' => 'Critical', 'instructions' => 'Evacuate now.', 'version' => $a['version']], $second);
    $upd = array_values(array_filter(ba_history($db, $id), fn($h) => $h['action'] === 'updated'));
    check($a['alert_status'] === 'Active' && count($upd) === 2 && in_array('instructions', $upd[1]['changes'], true), 'active alert edited; history lists changed fields');

    // ---- a second active alert, barangay-wide
    $wide = ba_create($db, [...$base, 'title' => 'Typhoon signal no. 2', 'hazard_type' => 'Typhoon', 'severity' => 'Advisory', 'scope' => 'barangay', 'puroks' => []], $admin);
    ba_activate($db, $wide, $admin);
    check(ba_get($db, $wide)['puroks'] === [] && ba_get($db, $wide)['scope'] === 'barangay', 'barangay-wide alert has no purok rows');

    // ---- turn off (idempotent)
    $r = ba_deactivate($db, $id, $second, "  Water receded.  ");
    $a = $r['alert'];
    check(!$r['already'] && $a['alert_status'] === 'Inactive' && (int)$a['is_active'] === 0 && $a['resolved_at'] !== null && (int)$a['resolved_by'] === $second && $a['resolution_note'] === 'Water receded.', 'turned off: Inactive, actor, time and note kept');
    $again = ba_deactivate($db, $id, $admin, 'different note');
    check($again['already'] === true && $again['alert']['resolution_note'] === 'Water receded.' && (int)$again['alert']['resolved_by'] === $second, 'second turn-off is a no-op and does not overwrite');
    check((int)$one("SELECT COUNT(*) FROM hazard_alert_history WHERE alert_id=$id AND action='deactivated'") === 1, 'one deactivation history entry');
    check(ba_get($db, $id) !== null, 'inactive record kept');
    $publicIds = array_column(ba_public_active($db), 'alert_id');
    check(!in_array($id, $publicIds, true) && in_array($wide, $publicIds, true), 'turning off one alert leaves the other active');
    refused(fn() => ba_activate($db, $id, $admin), 409, 'inactive alert cannot be reactivated');
    refused(fn() => ba_update($db, $id, [...$base, 'version' => $a['version']], $admin), 409, 'inactive alert cannot be edited');
    refused(fn() => ba_delete_draft($db, $id, $admin), 409, 'inactive alert cannot be deleted');
    refused(fn() => ba_deactivate($db, $id, $admin, str_repeat('n', 501)), 400, 'resolution note over 500 characters rejected');
    refused(fn() => ba_activate($db, 999999, $admin), 404, 'missing alert');

    // ---- the DB itself refuses an inconsistent state
    $dbRefused = false;
    try { $db->exec("UPDATE hazard_alerts SET alert_status='Inactive' WHERE alert_id=$wide"); } catch (PDOException $e) { $dbRefused = true; }
    check($dbRefused, 'CHECK constraint keeps alert_status and is_active in step');

    // ---- legacy insert AFTER the migration (seed scripts insert is_active only)
    $db->exec("INSERT INTO hazard_alerts (hazard_type,status,title,affected_purok,is_active,issued_at) VALUES ('Landslide','Warning','Legacy seed',NULL,1,NOW())");
    $leg = ba_get($db, (int)$db->lastInsertId());
    check($leg['alert_status'] === 'Active' && $leg['scope'] === 'barangay' && $leg['puroks'] === [], 'legacy insert reads as an active barangay-wide alert');
    $db->exec("INSERT INTO hazard_alerts (hazard_type,status,title,affected_purok,is_active) VALUES ('Flood','Warning','Legacy odd area','Riverside',1)");
    $odd = ba_get($db, (int)$db->lastInsertId());
    check($odd['puroks'] === [] && $odd['unmapped_area'] === 'Riverside', 'non-standard legacy area is kept as text, never drawn');

    // ---- ordering and highest severity
    $sev = array_column(ba_public_active($db), 'severity');
    $rank = array_map(fn($s) => BA_SEVERITY_RANK[$s] ?? 0, $sev);
    $sorted = $rank; rsort($sorted);
    check($rank === $sorted, 'public list is ordered by severity, highest first');

    // ---- delete draft
    $d = ba_create($db, [...$base, 'title' => 'Typo draft'], $admin);
    ba_delete_draft($db, $d, $admin);
    check(ba_get($db, $d) === null, 'draft deleted');

    // ---- listing: drafts only for admins
    $draft2 = ba_create($db, [...$base, 'title' => 'Hidden draft'], $admin);
    check(in_array($draft2, array_column(ba_list($db, [], true), 'alert_id'), true), 'admin list includes drafts');
    check(!in_array($draft2, array_column(ba_list($db, [], false), 'alert_id'), true), 'staff list excludes drafts');
    check(array_unique(array_column(ba_list($db, ['state' => 'Inactive'], true), 'alert_status')) === ['Inactive'], 'state filter');
    check((int)$one("SELECT COUNT(*) FROM audit_logs WHERE action LIKE 'Barangay alert%'") >= 6, 'changes written to the audit log');

    // ---- maintenance scripts (database/DEFENSE_TEST_DATA_CLEANUP.sql) delete test alerts directly: history must not block them
    $db->exec("UPDATE hazard_alerts SET description = CONCAT(IFNULL(description,''), ' [DEFENSE TEST]') WHERE alert_id IN ($id, $preId)");
    $db->exec("DELETE FROM hazard_alerts WHERE description LIKE '%[DEFENSE TEST]%'");
    check((int)$one("SELECT COUNT(*) FROM hazard_alert_history WHERE alert_id IN ($id, $preId)") === 0 && ba_get($db, $id) === null, 'cleanup DELETE of alerts with history succeeds (history removed with them)');
    $db->exec($migration);
    check(str_contains($ddl('hazard_alert_history'), 'ON DELETE CASCADE'), 're-running the migration keeps the cascading history key');
    echo "ALL $checks CHECKS PASSED\n";
} catch (Throwable $e) {
    echo $e->getMessage() . "\n";
    exit(1);
} finally {
    (new PDO('mysql:host=127.0.0.1;charset=utf8mb4', getenv('DB_USER') ?: 'root', getenv('DB_PASS') ?: ''))->exec('DROP DATABASE IF EXISTS `' . $fixture['database'] . '`');
}

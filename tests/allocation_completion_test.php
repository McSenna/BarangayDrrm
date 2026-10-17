<?php
// Complete Distribution: all-or-nothing locked stock deduction, ledger rows, idempotency, concurrency, validation.
// Uses a NEW isolated fixture database (tests/user_management_fixture.php) and drops it afterwards.
if (PHP_SAPI !== 'cli') exit(1);
require_once __DIR__ . '/../backend/lib/allocation_workflow.php';
putenv('USER_TEST_FULL_SCHEMA=1');
$fixture = json_decode(shell_exec(escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg(__DIR__ . '/user_management_fixture.php')), true);
$name = $fixture['database'] ?? '';
if (!preg_match('/^codex_users_test_\d{8}_\d{6}_[a-f0-9]+$/', $name)) { fwrite(STDERR, "fixture failed\n"); exit(1); }
$db = new PDO("mysql:host=127.0.0.1;dbname=$name;charset=utf8mb4", getenv('DB_USER') ?: 'root', getenv('DB_PASS') ?: '', [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$checks = 0;
function check($ok, $label) { global $checks; if (!$ok) throw new RuntimeException('FAIL ' . $label); $checks++; }
function denied(callable $fn, int $code, string $needle, string $label) {
    try { $fn(); } catch (AllocationWorkflowError $e) { check($e->getCode() === $code && stripos($e->getMessage(), $needle) !== false, "$label (got {$e->getCode()} {$e->getMessage()})"); return; }
    check(false, "$label (no error)");
}
$one = fn(string $sql) => $db->query($sql)->fetchColumn();
try {
    $admin = (int)$one("SELECT user_id FROM users WHERE email='admin@example.test'");
    $personnel = (int)$one("SELECT user_id FROM users WHERE role='relief_personnel' LIMIT 1"); // assigned Purok 3
    $db->exec("INSERT INTO users (full_name,email,password,role,is_active,assigned_purok) VALUES ('Officer','officer@example.test','x','field_officer',1,'Purok 3'),('Other personnel','p7@example.test','x','relief_personnel',1,'Purok 7')");
    $officer = (int)$one("SELECT user_id FROM users WHERE email='officer@example.test'");
    $farPersonnel = (int)$one("SELECT user_id FROM users WHERE email='p7@example.test'");
    $db->exec("INSERT INTO relief_items (item_name,category,quantity,unit) VALUES ('Rice 5kg','Food',10,'sack')"); $rice = (int)$db->lastInsertId();
    $db->exec("INSERT INTO relief_items (item_name,category,quantity,unit) VALUES ('Water 1L','Water',40,'bottle')"); $water = (int)$db->lastInsertId();
    $db->exec("INSERT INTO relief_packages (package_name,is_active,created_by) VALUES ('Standard',1,$admin)"); $pkg = (int)$db->lastInsertId();
    $db->exec("INSERT INTO relief_package_items (package_id,item_id,quantity) VALUES ($pkg,$rice,1),($pkg,$water,6)");
    $db->exec("UPDATE system_settings SET setting_value='$pkg' WHERE setting_key='standard_relief_package_id'");
    $n = 0;
    // A verified household in Purok 3 with a submitted visit, promoted to READY. Returns its allocation id.
    $makeReady = function () use ($db, $admin, $officer, &$n) {
        $n++;
        $db->prepare("INSERT INTO households (head_of_family,purok,address) VALUES (?,'Purok 3','Street')")->execute(["Family $n"]);
        $hid = (int)$db->lastInsertId();
        $db->prepare("INSERT INTO household_members (household_id,full_name,relationship,age,is_child,is_senior,is_pwd,is_pregnant,has_medical_needs,is_other_vulnerable,vulnerability_verified_at,vulnerability_verified_by) VALUES (?,?,'Head',30,0,0,0,0,0,0,NOW(),?)")->execute([$hid, "Family $n", $admin]);
        $db->exec("UPDATE households SET roster_verified_at=NOW(), roster_verified_by=$admin WHERE household_id=$hid");
        $aid = (int)aw_start_round($db, $hid, $admin)['allocation_id'];
        $db->prepare("INSERT INTO household_field_assessments (household_id,allocation_id,assigned_field_officer_id,status,field_visit_date,damage_classification,findings,submitted_at,locked_at,created_by,updated_by) VALUES (?,?,?,'assessed',CURDATE(),'Partially Damaged','Walls cracked',NOW(),NOW(),?,?)")->execute([$hid, $aid, $officer, $admin, $officer]);
        if (!aw_promote_if_complete($db, $hid, $officer)['promoted']) throw new RuntimeException('setup: not promoted');
        return $aid;
    };
    $lines = function (int $aid) use ($db) { $s = $db->prepare('SELECT allocation_item_id, item_id, planned_qty FROM household_allocation_items WHERE allocation_id=? ORDER BY allocation_item_id'); $s->execute([$aid]); return $s->fetchAll(PDO::FETCH_ASSOC); };
    $release = fn(int $aid, array $override = []) => array_map(fn($l) => ['allocation_item_id' => (int)$l['allocation_item_id'], 'released_qty' => $override[(int)$l['item_id']] ?? (int)$l['planned_qty']], $lines($aid));
    $stock = fn(int $item) => (int)$one("SELECT quantity FROM relief_items WHERE item_id=$item");

    // 1. Success: planned quantities released, stock deducted once, one ledger row per item with before/after.
    $a1 = $makeReady();
    denied(fn() => aw_complete_distribution($db, $a1, ['completion_key' => 'key-a1-0001', 'items' => $release($a1)], $officer), 403, 'Relief Personnel', 'field officer cannot complete');
    denied(fn() => aw_complete_distribution($db, $a1, ['completion_key' => 'key-a1-0001', 'items' => $release($a1)], $farPersonnel), 404, 'not found', 'out-of-Purok personnel get 404');
    $done = aw_complete_distribution($db, $a1, ['completion_key' => 'key-a1-0001', 'items' => $release($a1, [$water => 4]), 'recipient_name' => 'Family 1', 'remarks' => 'Received at hall'], $personnel);
    check($done['status'] === 'COMPLETED' && (int)$done['completed_by'] === $personnel && $done['completed_at'] && $done['recipient_name'] === 'Family 1', 'completed with actor, time and recipient');
    check($stock($rice) === 9 && $stock($water) === 36, 'released quantities deducted (water released 4 of 6 planned)');
    $logs = $db->query("SELECT item_id, log_type, quantity_change, previous_quantity, resulting_quantity, reference, allocation_ref, performed_by FROM inventory_logs WHERE allocation_ref=$a1 ORDER BY item_id")->fetchAll(PDO::FETCH_ASSOC);
    check(count($logs) === 2 && $logs[0]['log_type'] === 'Stock Out' && (int)$logs[0]['quantity_change'] === -1 && (int)$logs[0]['previous_quantity'] === 10 && (int)$logs[0]['resulting_quantity'] === 9
        && $logs[0]['reference'] === "Household allocation #$a1" && (int)$logs[0]['performed_by'] === $personnel && (int)$logs[1]['quantity_change'] === -4, 'ledger row per item with before/after');
    check((int)$one("SELECT released_qty FROM household_allocation_items WHERE allocation_id=$a1 AND item_id=$water") === 4, 'released quantity stored');
    check((int)$done['completed_score'] === 55 && $done['completed_priority'] === 'Moderate Priority' && $done['completed_rule_version'] === DSS_MODEL_VERSION, 'completed snapshot (40+5+0+10)');
    $remaining = array_column($done['items'], 'remaining_stock', 'item_name');
    check($remaining['Rice 5kg'] === 9 && $remaining['Water 1L'] === 36, 'remaining stock returned');
    $again = aw_complete_distribution($db, $a1, ['completion_key' => 'key-a1-0001', 'items' => $release($a1)], $personnel);
    check($again['status'] === 'COMPLETED' && $stock($rice) === 9 && (int)$one("SELECT COUNT(*) FROM inventory_logs WHERE allocation_ref=$a1") === 2, 'same key retried: no second deduction');
    denied(fn() => aw_complete_distribution($db, $a1, ['completion_key' => 'key-a1-0002', 'items' => $release($a1)], $personnel), 409, 'already completed', 'new key on a completed allocation');

    // 2. Validation (nothing changes on any of these).
    $a2 = $makeReady();
    $bad = fn(array $items) => fn() => aw_complete_distribution($db, $a2, ['completion_key' => 'key-a2-bad', 'items' => $items], $personnel);
    $l2 = $lines($a2);
    denied($bad($release($a2, [$rice => 2])), 400, 'more than planned', 'above planned rejected');
    denied($bad($release($a2, [$rice => 0, $water => 0])), 400, 'at least one', 'all zero rejected');
    denied($bad($release($a2, [$rice => -1])), 400, 'whole number', 'negative rejected');
    denied($bad([['allocation_item_id' => (int)$l2[0]['allocation_item_id'], 'released_qty' => 1.5], ['allocation_item_id' => (int)$l2[1]['allocation_item_id'], 'released_qty' => 1]]), 400, 'whole number', 'fractional rejected');
    denied($bad([['allocation_item_id' => (int)$l2[0]['allocation_item_id'], 'released_qty' => 1]]), 400, 'every planned item', 'every line required');
    denied(fn() => aw_complete_distribution($db, $a2, ['completion_key' => 'x', 'items' => $release($a2)], $personnel), 400, 'completion key', 'malformed key rejected');
    check($stock($rice) === 9 && aw_allocation($db, $a2)['status'] === 'READY_FOR_DISTRIBUTION', 'validation failures change nothing');

    // 3. Shortage on one item rolls back every item, the status and the ledger; the message names the item.
    $db->exec("UPDATE relief_items SET quantity=0 WHERE item_id=$rice");
    denied(fn() => aw_complete_distribution($db, $a2, ['completion_key' => 'key-a2-0001', 'items' => $release($a2)], $personnel), 409, 'Rice 5kg: need 1, available 0', 'shortage named');
    check($stock($water) === 36 && aw_allocation($db, $a2)['status'] === 'READY_FOR_DISTRIBUTION' && (int)$one("SELECT COUNT(*) FROM inventory_logs WHERE allocation_ref=$a2") === 0, 'all-or-nothing rollback');
    $db->exec("UPDATE relief_items SET quantity=10 WHERE item_id=$rice");

    // 4. Re-opened between opening the dialog and confirming → no longer ready, no stock change.
    aw_reopen($db, $a2, $admin, 'Recheck');
    denied(fn() => aw_complete_distribution($db, $a2, ['completion_key' => 'key-a2-0002', 'items' => $release($a2)], $personnel), 409, 'no longer ready', 're-opened allocation');
    check($stock($rice) === 10, 're-opened: stock untouched');

    // 5. A planned item deleted from the inventory → clear failure naming it.
    $a3 = $makeReady();
    $db->exec("INSERT INTO relief_items (item_name,category,quantity,unit) VALUES ('Blanket','Shelter',5,'piece')"); $blanket = (int)$db->lastInsertId();
    $db->exec("INSERT INTO household_allocation_items (allocation_id,item_id,item_name,unit,planned_qty) VALUES ($a3,$blanket,'Blanket','piece',1)");
    $db->exec("DELETE FROM relief_items WHERE item_id=$blanket");
    denied(fn() => aw_complete_distribution($db, $a3, ['completion_key' => 'key-a3-0001', 'items' => $release($a3)], $personnel), 409, 'Blanket is no longer in the inventory', 'deleted item named');
    check($stock($rice) === 10, 'deleted item: nothing deducted');

    // 6. Two personnel complete the same allocation at the same moment: exactly one succeeds, stock deducted once.
    $a4 = $makeReady();
    $before = $stock($rice);
    $start = (string)(microtime(true) * 1000 + 1500);
    $procs = [];
    foreach (['key-a4-0001', 'key-a4-0002'] as $key) {
        $procs[] = proc_open([PHP_BINARY, __DIR__ . '/allocation_completion_worker.php', $name, (string)$a4, (string)$personnel, $key, $start], [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
        $outs[] = $pipes;
    }
    $results = [];
    foreach ($procs as $i => $p) { $results[] = json_decode(stream_get_contents($outs[$i][1]), true); proc_close($p); }
    $ok = array_values(array_filter($results, fn($r) => $r['ok'] ?? false));
    $lost = array_values(array_filter($results, fn($r) => isset($r['ok']) && !$r['ok']));
    check(count($ok) === 1 && count($lost) === 1 && $lost[0]['code'] === 409, 'exactly one concurrent completion succeeds: ' . json_encode($results));
    check($stock($rice) === $before - 1 && (int)$one("SELECT COUNT(*) FROM inventory_logs WHERE allocation_ref=$a4") === 2, 'concurrent: stock deducted once');
    echo "PASS allocation completion ($checks checks)\n";
} finally {
    (new PDO('mysql:host=127.0.0.1;charset=utf8mb4', getenv('DB_USER') ?: 'root', getenv('DB_PASS') ?: ''))->exec("DROP DATABASE `$name`");
}

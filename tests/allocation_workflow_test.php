<?php
// Allocation state machine (backend/lib/allocation_workflow.php) against a NEW isolated fixture database.
if (PHP_SAPI !== 'cli') exit(1);
require_once __DIR__ . '/../backend/lib/allocation_workflow.php';
putenv('USER_TEST_FULL_SCHEMA=1');
$fixture = json_decode(shell_exec(escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg(__DIR__ . '/user_management_fixture.php')), true);
if (!preg_match('/^codex_users_test_\d{8}_\d{6}_[a-f0-9]+$/', $fixture['database'] ?? '')) { fwrite(STDERR, "fixture failed\n"); exit(1); }
$db = new PDO('mysql:host=127.0.0.1;dbname=' . $fixture['database'] . ';charset=utf8mb4', getenv('DB_USER') ?: 'root', getenv('DB_PASS') ?: '', [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$_SERVER['REMOTE_ADDR'] = '203.0.113.7';
$checks = 0;
function check($ok, $label) { global $checks; if (!$ok) throw new RuntimeException('FAIL ' . $label); $checks++; }
function denied(callable $fn, int $code, string $needle, string $label) {
    try { $fn(); } catch (AllocationWorkflowError $e) { check($e->getCode() === $code && stripos($e->getMessage(), $needle) !== false, "$label (got {$e->getCode()} {$e->getMessage()})"); return; }
    check(false, "$label (no error)");
}
$one = fn(string $sql) => $db->query($sql)->fetchColumn();
try {
    $admin = (int)$one("SELECT user_id FROM users WHERE email='admin@example.test'");
    $personnel = (int)$one("SELECT user_id FROM users WHERE role='relief_personnel' LIMIT 1");
    $db->exec("INSERT INTO users (full_name,email,password,role,is_active,assigned_purok) VALUES ('Field Officer','officer@example.test','x','field_officer',1,'Purok 3')");
    $officer = (int)$db->lastInsertId();
    $hid = (int)$one('SELECT household_id FROM households LIMIT 1');
    $head = $one("SELECT head_of_family FROM households WHERE household_id=$hid");
    // Complete, verified household: 1 person (5 pts), 0 vulnerable (0), Purok 3 inside (40) → subtotal 45.
    $db->prepare("INSERT INTO household_members (household_id,full_name,relationship,age,is_child,is_senior,is_pwd,is_pregnant,has_medical_needs,is_other_vulnerable,vulnerability_verified_at,vulnerability_verified_by) VALUES (?,?,'Head',30,0,0,0,0,0,0,NOW(),?)")->execute([$hid, $head, $admin]);
    $db->exec("UPDATE households SET roster_verified_at=NOW(), roster_verified_by=$admin WHERE household_id=$hid");
    // The fixture adds its household after the migrations ran, so round 1 is created here (as add_household.php does).
    aw_start_round($db, $hid, $admin);
    $alloc = aw_open_allocation($db, $hid);
    check($alloc && $alloc['status'] === 'PENDING_ASSESSMENT' && (int)$alloc['round_no'] === 1, 'round 1 open allocation');
    check((int)$one("SELECT COUNT(*) FROM household_allocation_history WHERE allocation_id={$alloc['allocation_id']} AND action='created'") === 1, 'round 1 logged as created');
    $aid = (int)$alloc['allocation_id'];

    // Refused transitions: anything not in AW_TRANSITIONS.
    foreach ([['PENDING_ASSESSMENT', 'COMPLETED'], ['PENDING_ASSESSMENT', 'CANCELLED']] as [$from, $to]) {
        denied(fn() => aw_transition($db, aw_allocation($db, $aid), $to, 'test', $admin), 409, "from $from to $to", "refuse $from → $to");
    }
    check(AW_TRANSITIONS['COMPLETED'] === [] && AW_TRANSITIONS['CANCELLED'] === [], 'closed states are final');

    // Promotion blockers, one at a time.
    $r = aw_promote_if_complete($db, $hid, $officer);
    check(!$r['promoted'] && in_array('Field visit not yet submitted.', $r['reasons'], true), 'blocked until the visit is submitted');
    $db->prepare("INSERT INTO household_field_assessments (household_id,allocation_id,assigned_field_officer_id,status,field_visit_date,damage_classification,findings,submitted_at,locked_at,created_by,updated_by) VALUES (?,?,?,'assessed',CURDATE(),'Severely Damaged','Roof gone',NOW(),NOW(),?,?)")->execute([$hid, $aid, $officer, $admin, $officer]);
    $r = aw_promote_if_complete($db, $hid, $officer);
    check(!$r['promoted'] && in_array('No standard relief package is set.', $r['reasons'], true), 'blocked without a standard package');
    $db->exec("INSERT INTO relief_items (item_name,category,quantity,unit) VALUES ('Rice 5kg','Food',10,'sack'),('Water 1L','Water',40,'bottle')");
    [$rice, $water] = array_map('intval', $db->query("SELECT item_id FROM relief_items ORDER BY item_id DESC LIMIT 2")->fetchAll(PDO::FETCH_COLUMN));
    [$rice, $water] = [$water, $rice];
    $db->exec("INSERT INTO relief_packages (package_name,is_active,created_by) VALUES ('Standard family pack',1,$admin)");
    $pkg = (int)$db->lastInsertId();
    $db->exec("INSERT INTO relief_package_items (package_id,item_id,quantity) VALUES ($pkg,$rice,1),($pkg,$water,6)");
    $db->exec("UPDATE system_settings SET setting_value='$pkg' WHERE setting_key='standard_relief_package_id'");
    $db->exec("UPDATE households SET roster_verified_at=NULL WHERE household_id=$hid");
    $r = aw_promote_if_complete($db, $hid, $officer);
    check(!$r['promoted'] && (bool)preg_grep('/^For Verification: /', $r['reasons']), 'blocked while source data is For Verification');
    $db->exec("UPDATE households SET roster_verified_at=NOW() WHERE household_id=$hid");

    // Promotion: snapshot, planned items from the standard package, history with actor + IP.
    $r = aw_promote_if_complete($db, $hid, $officer);
    $alloc = aw_allocation($db, $aid);
    check($r['promoted'] && $alloc['status'] === 'READY_FOR_DISTRIBUTION', 'promoted to READY');
    check((int)$alloc['ready_score'] === 60 && $alloc['ready_priority'] === 'Moderate Priority' && $alloc['ready_rule_version'] === DSS_MODEL_VERSION && (int)$alloc['package_id'] === $pkg, 'ready snapshot (40+5+0+15 = 60)');
    $snap = json_decode($alloc['ready_snapshot'], true);
    check($snap['score_breakdown']['damage'] === 15 && $snap['damage_classification'] === 'Severely Damaged', 'snapshot keeps the breakdown');
    $items = $db->query("SELECT item_id,item_name,unit,planned_qty,released_qty FROM household_allocation_items WHERE allocation_id=$aid ORDER BY item_id")->fetchAll(PDO::FETCH_ASSOC);
    check(count($items) === 2 && (int)$items[0]['planned_qty'] === 1 && $items[0]['item_name'] === 'Rice 5kg' && (int)$items[1]['planned_qty'] === 6 && $items[0]['released_qty'] === null, 'planned items copied from the package');
    $h = $db->query("SELECT * FROM household_allocation_history WHERE allocation_id=$aid AND action='auto_ready'")->fetch(PDO::FETCH_ASSOC);
    check($h && $h['from_status'] === 'PENDING_ASSESSMENT' && $h['to_status'] === 'READY_FOR_DISTRIBUTION' && (int)$h['user_id'] === $officer && $h['ip_address'] === '203.0.113.7', 'history row with actor and IP');
    check((int)$one('SELECT quantity FROM relief_items WHERE item_id=' . $rice) === 10, 'Ready never deducts stock');
    $again = aw_promote_if_complete($db, $hid, $officer);
    check(!$again['promoted'], 'promote is a no-op once READY');

    // Admin-only actions and reasons.
    foreach ([$officer, $personnel] as $actor) {
        denied(fn() => aw_reopen($db, $aid, $actor, 'Wrong damage level'), 403, 'administrator', 'non-admin cannot re-open');
        denied(fn() => aw_cancel($db, $aid, $actor, 'Moved away'), 403, 'administrator', 'non-admin cannot cancel');
        denied(fn() => aw_adjust_planned($db, $aid, [$rice => 2], $actor, 'Large family'), 403, 'administrator', 'non-admin cannot adjust');
        denied(fn() => aw_start_round($db, $hid, $actor), 403, 'administrator', 'non-admin cannot start a round');
    }
    denied(fn() => aw_reopen($db, $aid, $admin, ' '), 400, 'reason', 'reason required');
    denied(fn() => aw_adjust_planned($db, $aid, [$rice => 0], $admin, 'Less'), 400, 'only be raised', 'planned quantity cannot drop');
    aw_adjust_planned($db, $aid, [$rice => 3], $admin, 'Large family');
    check((int)$one("SELECT planned_qty FROM household_allocation_items WHERE allocation_id=$aid AND item_id=$rice") === 3, 'admin raises a planned quantity');
    check((int)$one("SELECT COUNT(*) FROM household_allocation_history WHERE allocation_id=$aid AND action='adjust_planned' AND reason='Large family'") === 1, 'adjustment logged with reason');
    denied(fn() => aw_start_round($db, $hid, $admin), 409, 'already has an open allocation', 'no second open allocation');

    // Re-open: back to ASSESSMENT_IN_PROGRESS, assessment unlocked, plan removed.
    aw_reopen($db, $aid, $admin, 'Wrong damage level');
    $alloc = aw_allocation($db, $aid);
    $visit = $db->query("SELECT status,locked_at,reopened_count FROM household_field_assessments WHERE allocation_id=$aid")->fetch(PDO::FETCH_ASSOC);
    check($alloc['status'] === 'ASSESSMENT_IN_PROGRESS' && $alloc['ready_score'] === null, 're-open leaves READY');
    check($visit['status'] === 'assigned' && $visit['locked_at'] === null && (int)$visit['reopened_count'] === 1, 're-open unlocks the assessment');
    check((int)$one("SELECT COUNT(*) FROM household_allocation_items WHERE allocation_id=$aid") === 0, 're-open clears the plan');
    denied(fn() => aw_cancel($db, $aid, $admin, 'Moved away'), 409, 'Cannot move', 'cancel only from READY');

    // Promote again, then cancel; a new round is allowed afterwards.
    $db->exec("UPDATE household_field_assessments SET status='assessed', locked_at=NOW() WHERE allocation_id=$aid");
    check(aw_promote_if_complete($db, $hid, $officer)['promoted'], 'promotes again after re-assessment (IN_PROGRESS → READY)');
    aw_cancel($db, $aid, $admin, 'Moved away');
    $alloc = aw_allocation($db, $aid);
    check($alloc['status'] === 'CANCELLED' && $alloc['cancel_reason'] === 'Moved away' && (int)$alloc['cancelled_by'] === $admin, 'cancelled with reason');
    $round = aw_start_round($db, $hid, $admin);
    check($round['status'] === 'PENDING_ASSESSMENT' && (int)$round['round_no'] === 2, 'admin starts round 2');
    check((int)$one("SELECT COUNT(*) FROM household_allocation_history WHERE allocation_id={$round['allocation_id']} AND action='start_round'") === 1, 'round start logged');
    echo "PASS allocation workflow ($checks checks)\n";
} finally {
    (new PDO('mysql:host=127.0.0.1;charset=utf8mb4', getenv('DB_USER') ?: 'root', getenv('DB_PASS') ?: ''))->exec('DROP DATABASE `' . $fixture['database'] . '`');
}

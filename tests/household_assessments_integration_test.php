<?php
// Field-officer visits per allocation round: assignment, drafts, locked submission, automatic Ready, revisions,
// legacy evidence and scope. Uses a NEW isolated fixture database (tests/user_management_fixture.php) and drops it.
if (PHP_SAPI !== 'cli') exit(1);
require_once __DIR__ . '/../backend/lib/household_assessments.php';
putenv('USER_TEST_FULL_SCHEMA=1');
putenv('HTTPSMS_SMS_ENABLED=true'); putenv('HTTPSMS_API_KEY=offline-test'); putenv('HTTPSMS_FROM=+639171234567');
$fixture = json_decode(shell_exec(escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg(__DIR__ . '/user_management_fixture.php')), true);
$name = $fixture['database'] ?? '';
if (!preg_match('/^codex_users_test_\d{8}_\d{6}_[a-f0-9]+$/', $name)) { fwrite(STDERR, "fixture failed\n"); exit(1); }
$dsn = 'mysql:host=127.0.0.1;dbname=' . $name . ';charset=utf8mb4';
$db = new PDO($dsn, getenv('DB_USER') ?: 'root', getenv('DB_PASS') ?: '', [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$checks = 0;
function assertHa($v, $message) { global $checks; if (!$v) throw new Exception($message); $checks++; }
function denyHa($fn, $code, $label = '') { try { $fn(); } catch (HouseholdAssessmentError $e) { assertHa($e->getCode() === $code, "$label: " . $e->getMessage()); return $e->getMessage(); } throw new Exception("Expected $code $label"); }
try {
    $db->exec("DELETE FROM users WHERE email <> 'admin@example.test'");
    $db->exec("UPDATE users SET user_id=1 WHERE email='admin@example.test'");
    $db->exec("INSERT INTO users (user_id,full_name,email,password,role,is_active,assigned_purok) VALUES
      (2,'Officer','o2@example.test','x','field_officer',1,'Purok 3'),(3,'Wrong Purok','o3@example.test','x','field_officer',1,'Purok 4'),
      (4,'Relief','r4@example.test','x','relief_personnel',1,'Purok 3'),(5,'Inactive','o5@example.test','x','field_officer',0,'Purok 3'),
      (6,'Other officer','o6@example.test','x','field_officer',1,'Purok 3')");
    $db->exec("DELETE FROM households");
    $db->exec("INSERT INTO households (household_id,head_of_family,purok,address) VALUES (1,'Family','Prk. 3','Street'),(2,'Other family','Purok 4','Street')");
    foreach ([1, 2] as $hid) aw_start_round($db, $hid, 1);
    $db->exec("INSERT INTO household_members (household_id,full_name,relationship,age,is_child,is_senior,is_pwd,is_pregnant,has_medical_needs,is_other_vulnerable,vulnerability_verified_at,vulnerability_verified_by) VALUES (1,'Family','Head',30,0,0,1,0,0,0,NOW(),1)");
    $db->exec("UPDATE households SET number_of_members=1,vulnerable_members=1,contact_number='09123456789',roster_verified_at=NOW(), roster_verified_by=1 WHERE household_id=1");
    // Legacy report evidence for household 1 stays protected and visible but never counts as a visit.
    $db->exec("INSERT INTO disaster_reports (report_id,household_id,user_id,disaster_type,location,severity,status,report_date) VALUES (1,1,1,'Flood','Purok 3','High','Verified',CURDATE())");
    $db->exec("INSERT INTO damage_assessments (report_id,house_damage,infrastructure_damage,property_damage,agricultural_damage,estimated_severity,remarks) VALUES (1,'Major','None','None','None','High','old evidence')");
    assertHa(ha_report_evidence_locked($db, 1), 'Legacy report evidence protected');
    assertHa(ha_household_evidence_locked($db, 1), 'Legacy household association protected');
    assertHa(!ha_household_evidence_locked($db, 2), 'Household with no assessment history remains deletable');
    $list = ha_list($db, 1);
    assertHa($list[0]['status'] === 'pending_assignment' && $list[0]['allocation_status'] === 'PENDING_ASSESSMENT', 'Legacy does not prove an actual visit');
    assertHa($list[0]['legacy_assessment']['remarks'] === 'old evidence', 'Legacy visible');

    $a = ['household_id' => 1, 'assigned_field_officer_id' => 2, 'version' => 0];
    denyHa(fn() => ha_assign($db, $a, 4), 403, 'relief cannot assign');
    denyHa(fn() => ha_assign($db, array_merge($a, ['assigned_field_officer_id' => 3]), 1), 400, 'wrong Purok officer');
    denyHa(fn() => ha_assign($db, array_merge($a, ['assigned_field_officer_id' => 5]), 1), 403, 'inactive officer');
    foreach ([[], true, 1.2, '1bad'] as $bad) { denyHa(fn() => ha_assign($db, array_merge($a, ['household_id' => $bad]), 1), 400, 'bad household id'); denyHa(fn() => ha_assign($db, array_merge($a, ['assigned_field_officer_id' => $bad]), 1), 400, 'bad officer id'); }
    $row = ha_assign($db, $a, 1);
    assertHa($row['status'] === 'assigned' && (int)$row['allocation_id'] === (int)aw_open_allocation($db, 1)['allocation_id'], 'Assignment belongs to the open allocation round');
    assertHa(count(ha_list($db, 2)) === 1 && count(ha_list($db, 6)) === 0, 'Only the assigned officer sees the visit');

    // Draft: partial data allowed, allocation moves to ASSESSMENT_IN_PROGRESS, nothing locked.
    $draft = ['household_id' => 1, 'version' => 1, 'findings' => 'Roof partly gone', 'damage_points' => 99];
    denyHa(fn() => ha_save_draft($db, $draft, 6), 403, 'unassigned officer cannot draft');
    $r = ha_save_draft($db, $draft, 2);
    assertHa($r['assessment']['draft_saved_at'] !== null && $r['assessment']['locked_at'] === null && $r['assessment']['status'] === 'assigned', 'Draft saved unlocked');
    assertHa($r['allocation']['status'] === 'ASSESSMENT_IN_PROGRESS', 'First draft moves the allocation to ASSESSMENT_IN_PROGRESS');
    denyHa(fn() => ha_save_draft($db, array_merge($draft, ['version' => 2, 'field_visit_date' => date('Y-m-d', strtotime('+1 day'))]), 2), 400, 'draft rejects a future visit date');

    assertHa((int)$db->query("SELECT COUNT(*) FROM sms_logs WHERE event_type='ASSESSMENT_COMPLETED'")->fetchColumn() === 0, 'No completion SMS for draft or automatic subtotal');
    // Submit: required fields, server-side points only, locked, automatic Ready when complete.
    $submission = ['household_id' => 1, 'version' => 2, 'field_visit_date' => date('Y-m-d'), 'findings' => 'Roof inspected.', 'remarks' => '',
                   'damage_points' => 0, 'final_score' => 100, 'priority_level' => 'Critical Priority', 'assigned_field_officer_id' => 6];
    denyHa(fn() => ha_submit($db, $submission, 2), 400, 'damage classification required');
    $submission['damage_classification'] = 'Major';
    denyHa(fn() => ha_submit($db, $submission, 2), 400, 'old damage scale rejected');
    $submission['damage_classification'] = 'Destroyed';
    foreach ([1, 4, 6] as $actor) denyHa(fn() => ha_submit($db, $submission, $actor), 403, "actor $actor cannot submit");
    $r = ha_submit($db, $submission, 2);
    assertHa($r['assessment']['status'] === 'assessed' && $r['assessment']['locked_at'] && $r['assessment']['submitted_at'] && (int)$r['assessment']['updated_by'] === 2, 'Actual visit recorded and locked');
    assertHa((int)$r['assessment']['assigned_field_officer_id'] === 2, 'Client cannot change the assigned officer');
    assertHa(!$r['promoted'] && $r['allocation']['status'] === 'ASSESSMENT_IN_PROGRESS' && in_array('No standard relief package is set.', $r['reasons'], true), 'Complete visit waits for the standard package, reason shown');
    $completion=$db->query("SELECT * FROM sms_logs WHERE event_type='ASSESSMENT_COMPLETED'")->fetchAll(PDO::FETCH_ASSOC);
    assertHa(count($completion)===1 && $completion[0]['status']==='Queued', 'Completed final score queues exactly one SMS while package is pending: '.json_encode([$completion,$r['reasons'],$db->query('SELECT status,error_message,event_type FROM sms_logs')->fetchAll(PDO::FETCH_ASSOC)]));
    assertHa(str_contains($completion[0]['message'],'Your household assessment is complete.') && !str_contains($completion[0]['message'],'ready for distribution'), 'Completion message does not promise relief');
    assertHa($completion[0]['recipient_number']==='09123456789' && (int)$completion[0]['household_id']===1 && in_array((int)$completion[0]['sms_id'],$r['queued_sms_ids'],true), 'Household recipient and post-commit queue returned');
    $again=aw_promote_if_complete($db,1,1);
    assertHa((int)$db->query("SELECT COUNT(*) FROM sms_logs WHERE event_type='ASSESSMENT_COMPLETED'")->fetchColumn()===1 && !$again['queued_sms_ids'],'Repeated computation does not queue duplicate completion SMS');
    $msg = denyHa(fn() => ha_submit($db, array_merge($submission, ['version' => 3]), 2), 409, 'second submit refused');
    assertHa(str_contains($msg, 'locked'), 'Locked message');
    assertHa((int)$db->query("SELECT COUNT(*) FROM household_assessment_revisions WHERE action='submission'")->fetchColumn() === 1, 'Exactly one submission revision');

    // Standard package arrives → promotion; final score = 40 (Purok 3) + 5 (1 person) + 10 (1 vulnerable) + 20 (Destroyed) = 75.
    $db->exec("INSERT INTO relief_items (item_id,item_name,category,quantity,unit) VALUES (1,'Rice 5kg','Food',10,'sack')");
    $db->exec("INSERT INTO relief_packages (package_id,package_name,is_active,created_by) VALUES (1,'Standard',1,1)");
    $db->exec("INSERT INTO relief_package_items (package_id,item_id,quantity) VALUES (1,1,2)");
    $db->exec("UPDATE system_settings SET setting_value='1' WHERE setting_key='standard_relief_package_id'");
    $p = aw_promote_all_waiting($db, 1);
    $alloc = aw_open_allocation($db, 1);
    assertHa($p['promoted'] === 1 && $alloc['status'] === 'READY_FOR_DISTRIBUTION' && (int)$alloc['ready_score'] === 75 && $alloc['ready_priority'] === 'High Priority', 'Promoted with the server-computed final score (client 100 ignored)');

    assertHa((int)$db->query("SELECT COUNT(*) FROM sms_logs WHERE event_type='ALLOCATION_READY_FOR_DISTRIBUTION'")->fetchColumn()===1,'Separate Ready notice logs without a legacy allocation foreign key');
    // Re-open → officer may submit again; the new submission promotes in the same transaction.
    aw_reopen($db, (int)$alloc['allocation_id'], 1, 'Re-check damage');
    $current = ha_list($db, 2)[0];
    $r = ha_submit($db, array_merge($submission, ['version' => (int)$current['version'], 'damage_classification' => 'No Damage']), 2);
    assertHa($r['promoted'] && $r['allocation']['status'] === 'READY_FOR_DISTRIBUTION' && (int)$r['allocation']['ready_score'] === 55, 'Re-submitted visit promotes immediately (No Damage → 55)');
    assertHa((int)$db->query("SELECT COUNT(*) FROM sms_logs WHERE event_type='ASSESSMENT_COMPLETED'")->fetchColumn()===1,'Reopened assessment in same round does not send another completion notice');
    $revisions = $db->query('SELECT action, before_json FROM household_assessment_revisions ORDER BY revision_id')->fetchAll(PDO::FETCH_ASSOC);
    assertHa(array_column($revisions, 'action') === ['assignment', 'draft', 'submission', 'reopen', 'submission'], 'Every change audited: ' . implode(',', array_column($revisions, 'action')));
    assertHa(json_decode($revisions[4]['before_json'], true)['damage_classification'] === 'Destroyed', 'Old classification preserved in history');
    assertHa($db->query('SELECT remarks FROM damage_assessments')->fetchColumn() === 'old evidence', 'Legacy unchanged');
    denyHa(fn() => ha_assign($db, ['household_id' => 1, 'assigned_field_officer_id' => 6, 'version' => (int)ha_list($db, 1)[0]['version']], 1), 409, 'no reassignment while Ready');

    ha_assign($db,['household_id'=>2,'assigned_field_officer_id'=>3,'version'=>0],1);
    $db->exec("UPDATE households SET number_of_members=0,contact_number='09123456780' WHERE household_id=2");
    $incomplete=ha_submit($db,array_merge($submission,['household_id'=>2,'version'=>1]),3);
    assertHa(!$incomplete['queued_sms_ids'] && (int)$db->query("SELECT COUNT(*) FROM sms_logs WHERE household_id=2 AND event_type='ASSESSMENT_COMPLETED'")->fetchColumn()===0,'Submitted visit with incomplete final score does not send completion SMS');
    // Officer moved to another Purok loses access.
    $db->exec("UPDATE users SET assigned_purok='Purok 4' WHERE user_id=2");
    assertHa(count(ha_list($db, 2)) === 0, 'Out-of-Purok officer sees nothing');

    // The officer account row is locked while an assessment action runs (serialises concurrent profile edits).
    $second = new PDO($dsn, getenv('DB_USER') ?: 'root', getenv('DB_PASS') ?: '', [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    $second->exec('SET innodb_lock_wait_timeout=1');
    $db->beginTransaction(); ha_actor($db, 6);
    try { $second->exec('UPDATE users SET is_active=0 WHERE user_id=6'); throw new Exception('Concurrent officer profile change was not serialized'); }
    catch (PDOException $e) { assertHa(($e->errorInfo[1] ?? 0) === 1205, 'Expected account row lock timeout'); }
    finally { $db->rollBack(); }
    echo "PASS household assessments: rounds, drafts, locked submission, automatic Ready, revisions, legacy, scope and concurrency ($checks checks)\n";
} finally {
    (new PDO('mysql:host=127.0.0.1;charset=utf8mb4', getenv('DB_USER') ?: 'root', getenv('DB_PASS') ?: ''))->exec("DROP DATABASE `$name`");
}




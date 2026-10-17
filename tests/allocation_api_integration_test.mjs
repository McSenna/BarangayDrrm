// Relief allocation workflow through the real PHP API on an isolated fixture database.
// Run from the repository root: node tests/allocation_api_integration_test.mjs
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
const php = process.env.PHP_BIN || 'C:/xampp/php/php.exe';
const fixture = JSON.parse(execFileSync(php, ['tests/user_management_fixture.php'], { encoding: 'utf8', env: { ...process.env, USER_TEST_FULL_SCHEMA: '1' } }));
if (!/^codex_users_test_\d{8}_\d{6}_[a-f0-9]+$/.test(fixture.database)) throw new Error('Isolated fixture database required');
const port = 8123, base = `http://127.0.0.1:${port}/backend/`;
const server = spawn(php, ['-S', `127.0.0.1:${port}`, '-t', '.', 'backend/dev_router.php'], { env: { ...process.env, DB_HOST: '127.0.0.1', DB_NAME: fixture.database }, stdio: 'ignore' });
let checks = 0;
const check = (ok, label) => { assert.ok(ok, label); checks++; console.log('PASS ' + label); };
const sqlScript = "$p=new PDO('mysql:host=127.0.0.1;dbname='.$argv[1],getenv('DB_USER')?:'root',getenv('DB_PASS')?:'',[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);";
const sql = (q) => execFileSync(php, ['-r', sqlScript + '$p->exec($argv[2]);', fixture.database, q], { encoding: 'utf8' });
const value = (q) => execFileSync(php, ['-r', sqlScript + 'echo json_encode($p->query($argv[2])->fetchColumn());', fixture.database, q], { encoding: 'utf8' });
const num = (q) => Number(JSON.parse(value(q)));
async function call(path, method = 'GET', data, cookie) {
  const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: data ? JSON.stringify(data) : undefined });
  const text = await res.text();
  let body; try { body = JSON.parse(text); } catch { body = { raw: text }; }
  return { status: res.status, body, cookie: res.headers.get('set-cookie')?.split(';')[0] };
}
const login = async (email) => (await call('auth/login.php', 'POST', { email, password: fixture.password })).cookie;
try {
  for (let i = 0; i < 60; i++) { try { await fetch(base + 'auth/session.php'); break; } catch { await new Promise(r => setTimeout(r, 100)); } }
  const hash = execFileSync(php, ['-r', 'echo password_hash($argv[1], PASSWORD_DEFAULT);', fixture.password], { encoding: 'utf8' });
  sql(`INSERT INTO users (full_name,email,password,role,is_active,assigned_purok) VALUES ('Field Officer','officer@example.test','${hash}','field_officer',1,'Purok 3')`);
  const admin = await login('admin@example.test'), personnel = await login('personnel@example.test'), officer = await login('officer@example.test'), resident = await login('resident@example.test');
  const officerId = num("SELECT user_id FROM users WHERE email='officer@example.test'");
  const adminId = num("SELECT user_id FROM users WHERE email='admin@example.test'");
  sql("INSERT INTO relief_items (item_id,item_name,category,quantity,unit) VALUES (901,'Rice 5kg','Food',10,'sack'),(902,'Water 1L','Water',40,'bottle')");
  sql(`INSERT INTO relief_packages (package_id,package_name,is_active,created_by) VALUES (91,'Standard family pack',1,${adminId})`);
  sql('INSERT INTO relief_package_items (package_id,item_id,quantity) VALUES (91,901,2),(91,902,6)');

  // Household A (fixture household, Purok 3): verified people by API, round 1 started by the admin.
  const hidA = num("SELECT household_id FROM households WHERE head_of_family='Test household'");
  const round = await call('allocations/start_round.php', 'POST', { household_id: hidA }, admin);
  check(round.status === 200 && round.body.data.status === 'PENDING_ASSESSMENT', 'admin starts round 1 → PENDING_ASSESSMENT');
  check((await call('allocations/start_round.php', 'POST', { household_id: hidA }, personnel)).status === 403, 'only admins start rounds');
  for (const [i, person] of [['Test household', 'Head', 0], ['Child One', 'Child', 1]].entries()) {
    const added = await call('households/members/add_member.php', 'POST', { household_id: hidA, full_name: person[0], relationship: person[1], age: i ? 8 : 40, is_child: i ? 1 : 0, is_senior: 0, is_pwd: 0, is_pregnant: 0, has_medical_needs: 0, is_other_vulnerable: 0, verify_vulnerability: true }, admin);
    assert.equal(added.status, 201, JSON.stringify(added.body));
  }
  check((await call('households/members/verify_roster.php', 'POST', { household_id: hidA, confirm_complete: true }, admin)).status === 200, 'roster verified');
  const assessments = async (cookie) => (await call(`disasters/list_household_assessments.php?household_id=${hidA}`, 'GET', undefined, cookie)).body.data;
  check((await call('disasters/assign_household_assessment.php', 'POST', { household_id: hidA, assigned_field_officer_id: officerId, version: 0 }, admin)).status === 200, 'admin assigns the officer');

  // Officer submits a complete visit before any standard package exists → waits with the reason; client points ignored.
  const visit = await assessments(officer);
  const submitted = await call('allocations/assessment_submit.php', 'POST', { household_id: hidA, version: visit[0].version, field_visit_date: new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10), damage_classification: 'Severely Damaged', findings: 'Roof blown off.', final_score: 100, priority_level: 'Critical Priority', damage_points: 20 }, officer);
  check(submitted.status === 200 && !submitted.body.data.promoted && submitted.body.data.reasons.includes('No standard relief package is set.') && submitted.body.data.allocation.status === 'ASSESSMENT_IN_PROGRESS', 'submitted visit waits for the standard package');
  check((await call('relief/packages/set_standard.php', 'POST', { package_id: 91 }, personnel)).status === 403, 'only admins set the standard package');
  const setStd = await call('relief/packages/set_standard.php', 'POST', { package_id: 91 }, admin);
  check(setStd.status === 200 && setStd.body.data.promoted === 1, 'setting the standard package promotes the waiting household');
  const allocA = num(`SELECT allocation_id FROM household_allocations WHERE household_id=${hidA}`);
  // 2 people (5) + 1 vulnerable child (10) + Purok 3 inside (40) + Severely damaged (15) = 70
  check(num(`SELECT ready_score FROM household_allocations WHERE allocation_id=${allocA}`) === 70 && JSON.parse(value(`SELECT ready_priority FROM household_allocations WHERE allocation_id=${allocA}`)) === 'High Priority', 'Ready snapshot uses the server score (client 100 ignored)');
  check(num('SELECT quantity FROM relief_items WHERE item_id=901') === 10, 'Ready never deducts stock');

  // Other states, seeded directly: pending, in progress, completed, cancelled (Purok 3) and Ready in Purok 7.
  const seedHousehold = (name, purok, status, extra = '') => {
    sql(`INSERT INTO households (head_of_family,purok,address) VALUES ('${name}','${purok}','Street')`);
    const hid = num(`SELECT household_id FROM households WHERE head_of_family='${name}'`);
    sql(`INSERT INTO household_allocations (household_id,round_no,status${extra ? ',' + extra.split('=')[0] : ''}) VALUES (${hid},1,'${status}'${extra ? ',' + extra.split('=')[1] : ''})`);
    return num(`SELECT allocation_id FROM household_allocations WHERE household_id=${hid}`);
  };
  const others = {
    PENDING_ASSESSMENT: seedHousehold('Pending family', 'Purok 3', 'PENDING_ASSESSMENT'),
    ASSESSMENT_IN_PROGRESS: seedHousehold('Progress family', 'Purok 3', 'ASSESSMENT_IN_PROGRESS'),
    COMPLETED: seedHousehold('Done family', 'Purok 3', 'COMPLETED'),
    CANCELLED: seedHousehold('Cancelled family', 'Purok 3', 'CANCELLED', "cancel_reason='Moved'"),
  };
  const farReady = seedHousehold('Far family', 'Purok 7', 'READY_FOR_DISTRIBUTION', 'ready_score=90');
  const readyB = seedHousehold('Second ready', 'Purok 3', 'READY_FOR_DISTRIBUTION', 'ready_score=50');

  const list = await call('allocations/ready_list.php', 'GET', undefined, personnel);
  const ids = list.body.data.map(r => r.allocation_id);
  check(list.status === 200 && ids.length === 2 && ids[0] === allocA && ids[1] === readyB, 'personnel list: only Ready allocations in their Purok, highest score first');
  check(list.body.data.every(r => r.status === 'READY_FOR_DISTRIBUTION'), 'every listed row is Ready');
  const rowA = list.body.data[0];
  check(rowA.items.length === 2 && rowA.items[0].planned_qty === 2 && rowA.assessed_by_name === 'Field Officer' && rowA.breakdown.damage === 15 && rowA.damage_label === 'Severely damaged', 'list shows plan, officer and breakdown');
  check((await call('allocations/ready_list.php?q=Second', 'GET', undefined, personnel)).body.data.length === 1, 'search by head name');
  check((await call('allocations/ready_list.php?priority=High%20Priority', 'GET', undefined, personnel)).body.data.map(r => r.allocation_id).join() === String(allocA), 'filter by priority');
  for (const [status, id] of Object.entries(others)) check((await call(`allocations/get.php?id=${id}`, 'GET', undefined, personnel)).status === 404, `personnel get ${status} → 404`);
  check((await call(`allocations/get.php?id=${farReady}`, 'GET', undefined, personnel)).status === 404, 'personnel get other-Purok Ready → 404');
  check((await call(`allocations/get.php?id=${allocA}`, 'GET', undefined, personnel)).status === 200, 'personnel get own Ready → 200');
  for (const [who, cookie] of [['resident', resident], ['field officer', officer]]) {
    check((await call('allocations/ready_list.php', 'GET', undefined, cookie)).status === 403, `${who} cannot list Ready allocations`);
    check((await call('allocations/complete.php', 'POST', { allocation_id: allocA }, cookie)).status === 403, `${who} cannot complete`);
  }
  check((await call('allocations/list.php', 'GET', undefined, personnel)).status === 403, 'admin list is admin-only');

  // Scores agree across the Ready list, the priority list and its CSV.
  const pl = (await call(`dashboard/priority_list.php?household_id=${hidA}`, 'GET', undefined, admin)).body.data[0];
  check(pl.final_score === 70 && pl.priority_level === 'High Priority' && pl.allocation_status === 'READY_FOR_DISTRIBUTION', 'priority list agrees with the Ready snapshot');
  const csv = await (await fetch(base + 'dashboard/priority_list.php?export=csv', { headers: { Cookie: admin } })).text();
  check(csv.includes('Final score / 100') && csv.includes('Severely damaged') && csv.includes(',70,'), 'CSV carries damage and final score');

  // Complete distribution through the API.
  const lines = rowA.items.map(i => ({ allocation_item_id: i.allocation_item_id, released_qty: i.planned_qty }));
  const done = await call('allocations/complete.php', 'POST', { allocation_id: allocA, completion_key: 'api-complete-0001', items: lines, recipient_name: 'Test household' }, personnel);
  check(done.status === 200 && done.body.data.status === 'COMPLETED' && done.body.data.items.find(i => i.item_name === 'Rice 5kg').remaining_stock === 8, 'completion deducts stock and returns the remaining stock');
  const retry = await call('allocations/complete.php', 'POST', { allocation_id: allocA, completion_key: 'api-complete-0001', items: lines }, personnel);
  check(retry.status === 200 && num('SELECT quantity FROM relief_items WHERE item_id=901') === 8, 'retried request (same key) deducts nothing more');
  check(!(await call('allocations/ready_list.php', 'GET', undefined, personnel)).body.data.some(r => r.allocation_id === allocA), 'completed allocation leaves the Ready list');

  // Admin re-open removes a Ready allocation from the personnel list.
  check((await call('allocations/reopen.php', 'POST', { allocation_id: readyB, reason: 'Wrong household size' }, personnel)).status === 403, 'personnel cannot re-open');
  sql(`INSERT INTO household_field_assessments (household_id,allocation_id,assigned_field_officer_id,status,locked_at,created_by,updated_by) SELECT household_id,${readyB},${officerId},'assessed',NOW(),${adminId},${adminId} FROM household_allocations WHERE allocation_id=${readyB}`);
  check((await call('allocations/reopen.php', 'POST', { allocation_id: readyB, reason: 'Wrong household size' }, admin)).status === 200, 'admin re-opens');
  check((await call('allocations/ready_list.php', 'GET', undefined, personnel)).body.data.length === 0, 're-opened allocation is gone from the personnel list');
  const history = (await call(`allocations/history.php?id=${readyB}`, 'GET', undefined, admin)).body.data;
  check(history.some(h => h.action === 'reopen' && h.reason === 'Wrong household size' && h.user_name === 'Test Administrator' && h.ip_address), 'history shows who re-opened, why and from where');

  // Completed snapshot stays fixed while the current score changes.
  const members = (await call(`households/members/get_members.php?household_id=${hidA}`, 'GET', undefined, admin)).body.data;
  check((await call('households/members/delete_member.php', 'DELETE', { member_id: members.at(-1).member_id }, admin)).status === 200, 'member removed after completion');
  const adminList = (await call('allocations/list.php', 'GET', undefined, admin)).body.data;
  const a = adminList.allocations.find(r => r.allocation_id === allocA);
  check(a.completed_score === 70 && a.ready_score === 70 && a.current.final_score === null, 'snapshots fixed; current score recalculated separately');

  // Dashboards, reports and exports read the workflow tables (plus labelled history).
  const overview = (await call('dashboard/overview.php?range=all', 'GET', undefined, admin)).body.data;
  check(overview.pipeline.distributed >= 1 && overview.pipeline.ready >= 0 && overview.latest_ids.allocations >= allocA && 'Pending Assessment' in overview.priorities.levels, 'admin dashboard pipeline counts workflow rounds');
  check(overview.queue.allocations.every(q => ['PENDING_ASSESSMENT', 'ASSESSMENT_IN_PROGRESS', 'READY_FOR_DISTRIBUTION'].includes(q.status)), 'dashboard queue lists only open rounds');
  const stats = (await call('dashboard/statistics.php', 'GET', undefined, admin)).body.data;
  check(JSON.stringify(stats).includes('COMPLETED'), 'statistics count workflow statuses');
  const relief = (await call('reports/relief_reports.php', 'GET', undefined, admin)).body.data;
  const line = relief.distribution_history.find(h => Number(h.allocation_id) === allocA && h.item_name === 'Rice 5kg');
  check(line && Number(line.quantity) === 2 && line.source === 'Allocation workflow' && Number(line.dss_score) === 70 && relief.total_beneficiaries >= 1, 'relief report lists the completed distribution with its snapshot score');
  const recon = (await call('reports/inventory_reconciliation.php', 'GET', undefined, admin)).body.items.find(i => i.item_id === 901);
  check(recon.stock_out_distribution === 2 && recon.distributed_received === 2 && recon.checks.distribution_matches_ledger && recon.reserved === 0, 'reconciliation ties the Stock Out to the completed allocation');
  const today = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
  const situation = (await call(`reports/situation_report.php?date_from=2020-01-01&date_to=${today}`, 'GET', undefined, admin)).body;
  check(situation.allocations.by_status.Completed.count >= 1 && situation.distribution.ready_for_distribution >= 0, 'situation report uses workflow statuses');
  const analytics = (await call('reports/dashboard_analytics.php', 'GET', undefined, admin)).body.data;
  check(analytics.summary ? analytics.summary.total_distributed_items >= 8 : JSON.stringify(analytics).includes('total_distributed_items'), 'analytics include released quantities');
  // Guards: a Ready plan item and the standard package keep their items; open rounds keep their household.
  const readyNow = (await call('allocations/ready_list.php', 'GET', undefined, admin)).body.data;
  check((await call('inventory/delete_item.php', 'DELETE', { item_id: 902 }, admin)).status === 409, 'item in the standard package / a Ready plan cannot be deleted');
  check(readyNow.length >= 0, 'ready list readable by admin');
  check((await call('households/delete_household.php', 'DELETE', { household_id: hidA }, admin)).status === 409, 'household with allocation history is kept');
  const fresh = await call('households/add_household.php', 'POST', { head_of_family: 'Mistake entry', purok: 'Purok 6', address: 'Street', number_of_members: 1 }, admin);
  check((await call('households/delete_household.php', 'DELETE', { household_id: Number(fresh.body.household_id) }, admin)).status === 200, 'household with only an untouched round can still be deleted');

  // A new household starts with an open allocation; a visit blocked only by an unverified roster becomes Ready
  // the moment the administrator verifies the roster; later member edits leave the Ready snapshot alone.
  const addedB = await call('households/add_household.php', 'POST', { head_of_family: 'Hook family', purok: 'Purok 3', address: 'Street', number_of_members: 1 }, admin);
  const hidB = Number(addedB.body.household_id);
  check(addedB.status === 201 && JSON.parse(value(`SELECT status FROM household_allocations WHERE household_id=${hidB}`)) === 'PENDING_ASSESSMENT', 'new household gets a PENDING_ASSESSMENT allocation');
  check(num(`SELECT COUNT(*) FROM household_allocation_history h JOIN household_allocations a ON a.allocation_id=h.allocation_id WHERE a.household_id=${hidB} AND h.action='created'`) === 1, 'its creation is in the history');
  assert.equal((await call('households/members/add_member.php', 'POST', { household_id: hidB, full_name: 'Hook family', relationship: 'Head', age: 70, is_child: 0, is_senior: 1, is_pwd: 0, is_pregnant: 0, has_medical_needs: 0, is_other_vulnerable: 0, verify_vulnerability: true }, admin)).status, 201);
  assert.equal((await call('disasters/assign_household_assessment.php', 'POST', { household_id: hidB, assigned_field_officer_id: officerId, version: 0 }, admin)).status, 200);
  const visitB = (await call(`disasters/list_household_assessments.php?household_id=${hidB}`, 'GET', undefined, officer)).body.data[0];
  const subB = await call('allocations/assessment_submit.php', 'POST', { household_id: hidB, version: visitB.version, field_visit_date: new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10), damage_classification: 'Destroyed', findings: 'House collapsed.' }, officer);
  check(subB.status === 200 && !subB.body.data.promoted && subB.body.data.reasons.some(r => r.startsWith('For Verification:')), 'visit waits while the roster is unverified');
  check((await call('households/members/verify_roster.php', 'POST', { household_id: hidB, confirm_complete: true }, admin)).status === 200, 'admin verifies the roster');
  const allocB = num(`SELECT allocation_id FROM household_allocations WHERE household_id=${hidB}`);
  // 1 person (5) + 1 senior (10) + Purok 3 (40) + Destroyed (20) = 75
  check(JSON.parse(value(`SELECT status FROM household_allocations WHERE allocation_id=${allocB}`)) === 'READY_FOR_DISTRIBUTION' && num(`SELECT ready_score FROM household_allocations WHERE allocation_id=${allocB}`) === 75, 'roster verification promotes to Ready automatically');
  const memberB = (await call(`households/members/get_members.php?household_id=${hidB}`, 'GET', undefined, admin)).body.data[0];
  check((await call('households/members/update_member.php', 'PUT', { member_id: memberB.member_id, full_name: 'Hook family', relationship: 'Head', age: 71, is_child: 0, is_senior: 1, is_pwd: 1, is_pregnant: 0, has_medical_needs: 0, is_other_vulnerable: 0, verify_vulnerability: true }, admin)).status === 200, 'member edited while Ready');
  const afterEdit = (await call('allocations/list.php', 'GET', undefined, admin)).body.data.allocations.find(r => r.allocation_id === allocB);
  check(afterEdit.status === 'READY_FOR_DISTRIBUTION' && afterEdit.ready_score === 75 && afterEdit.current.final_score === null, 'Ready snapshot unchanged; current score shown separately');

  // Retired paths answer 410.
  for (const path of ['relief/create_allocation.php', 'relief/approve_allocation.php', 'relief/mark_ready.php', 'relief/distribute.php', 'relief/emergency_override.php', 'relief/approve_recommendation.php', 'relief/reject_recommendation.php', 'relief/restore_recommendation.php', 'requests/process_request.php']) {
    const r = await call(path, 'POST', {}, admin);
    check(r.status === 410 && r.body.message === 'This action was replaced by the new allocation workflow.', `retired: ${path}`);
  }
  check((await call('relief/schedules/update_beneficiary_status.php', 'POST', { beneficiary_id: 1, status: 'Delivered' }, admin)).status === 410, 'retired: schedule Delivered (stock-moving) step');
  console.log(`PASS: ${checks} allocation API checks (${fixture.database})`);
} finally {
  server.kill();
  execFileSync(php, ['-r', "(new PDO('mysql:host=127.0.0.1',getenv('DB_USER')?:'root',getenv('DB_PASS')?:''))->exec('DROP DATABASE `'.$argv[1].'`');", fixture.database]);
}

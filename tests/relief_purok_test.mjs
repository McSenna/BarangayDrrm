import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
const php = process.env.PHP_BIN || 'C:/xampp/php/php.exe';
const fixture = JSON.parse(execFileSync(php, ['tests/user_management_fixture.php'], { encoding: 'utf8', env: { ...process.env, USER_TEST_FULL_SCHEMA: '1' } }));
const base = 'http://127.0.0.1:8109/backend/';
const server = spawn(php, ['-S', '127.0.0.1:8109', '-t', '.', 'backend/dev_router.php'], { env: { ...process.env, DB_HOST: '127.0.0.1', DB_NAME: fixture.database }, stdio: 'ignore' });
let checks = 0;
const check = (value, label) => { assert.ok(value, label); checks++; console.log('PASS ' + label); };
const sql = (query) => execFileSync(php, ['-r', "$p = new PDO('mysql:host=127.0.0.1;dbname=' . $argv[1], getenv('DB_USER') ?: 'root', getenv('DB_PASS') ?: '', [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]); $p->exec($argv[2]);", fixture.database, query]);
async function call(path, method = 'GET', data, cookie) {
  const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: data ? JSON.stringify(data) : undefined });
  const text = await res.text();
  try { return { status: res.status, data: JSON.parse(text), cookie: res.headers.get('set-cookie')?.split(';')[0] }; }
  catch { throw new Error(path + ': ' + text); }
}
try {
  for (let n = 0; n < 50; n++) { try { await fetch(base + 'auth/session.php'); break; } catch { await new Promise(r => setTimeout(r, 100)); } }
  const admin = (await call('auth/login.php', 'POST', { email: 'admin@example.test', password: fixture.password })).cookie;
  const account = { full_name: 'New Relief Officer', email: 'new-relief@example.test', password: fixture.password, role: 'relief_personnel' };
  check((await call('users/add_user.php', 'POST', account, admin)).status === 400, 'assignment required for relief account');
  check((await call('users/add_user.php', 'POST', { ...account, assigned_purok: 'Purok 99' }, admin)).status === 400, 'unknown Purok rejected');
  check((await call('users/add_user.php', 'POST', { ...account, assigned_purok: 'Purok 1' }, admin)).status === 201, 'admin creates relief account with assignment');
  const login = await call('auth/login.php', 'POST', { email: 'personnel@example.test', password: fixture.password });
  const officer = login.cookie;
  check(login.status === 200 && login.data.user.assigned_purok === 'Purok 3', 'relief login includes assigned area');
  sql(`INSERT INTO households (head_of_family,purok,address,number_of_members) VALUES ('Outside household','Purok 1','Outside street',99);
    INSERT INTO relief_items (item_name,quantity,unit) VALUES ('Scope supplies',100,'pcs');
    INSERT INTO relief_packages (package_name) VALUES ('Scope package');
    INSERT INTO distribution_schedules (package_id,distribution_date,location,assigned_personnel) SELECT 1,CURDATE(),'Distribution center',user_id FROM users WHERE email='personnel@example.test';
    INSERT INTO distribution_schedules (package_id,distribution_date,location,assigned_personnel) SELECT 1,CURDATE(),'Outside center',user_id FROM users WHERE email='personnel@example.test';
    INSERT INTO distribution_beneficiaries (schedule_id,household_id) VALUES (1,1),(1,2),(2,2);
    INSERT INTO relief_allocations (household_id,item_id,quantity,status,allocation_date) VALUES (1,1,2,'Approved',CURDATE()),(2,1,2,'Approved',CURDATE());
    INSERT INTO household_allocations (household_id,round_no,status,ready_score,ready_priority,ready_at) VALUES (1,1,'READY_FOR_DISTRIBUTION',50,'Moderate Priority',NOW()),(2,1,'READY_FOR_DISTRIBUTION',90,'Critical Priority',NOW());
    INSERT INTO household_allocation_items (allocation_id,item_id,item_name,unit,planned_qty) VALUES (1,1,'Scope supplies','pcs',1),(2,1,'Scope supplies','pcs',1);`);
  for (const [path, key] of [['households/get_households.php','data'], ['dashboard/priority_list.php','data'], ['relief/get_allocations.php','data'], ['relief/delivery/search_beneficiaries.php','data'], ['allocations/ready_list.php','data']]) {
    const r = await call(path, 'GET', undefined, officer);
    check(r.status === 200 && r.data[key].length === 1 && r.data[key][0].purok === 'Purok 3', 'scoped list: ' + path);
  }
  const schedules = await call('relief/schedules/get_schedules.php', 'GET', undefined, officer);
  check(schedules.data.data.length === 1 && schedules.data.data[0].total_beneficiaries === 1, 'schedules hide outside-only schedule and outside beneficiary counts');
  const detail = await call('relief/schedules/get_schedule_detail.php?schedule_id=1', 'GET', undefined, officer);
  check(detail.data.data.beneficiaries.length === 1 && detail.data.data.beneficiaries[0].purok === 'Purok 3', 'mixed schedule detail hides outside beneficiaries');
  check((await call('relief/schedules/get_schedule_detail.php?schedule_id=2', 'GET', undefined, officer)).status === 403, 'outside-only schedule detail denied');
  const stats = await call('dashboard/personnel_stats.php', 'GET', undefined, officer);
  check(stats.status === 200 && stats.data.data.assigned_schedules_count === 1 && stats.data.data.pending_deliveries_count === 1 && stats.data.data.approved_allocations_count === 1, 'personnel statistics exclude outside records');
  check(stats.data.data.today_schedules[0].total_beneficiaries === 1, 'dashboard schedule summaries scoped');
  const households = await call('dashboard/household_statistics.php', 'GET', undefined, officer);
  check(households.status === 200 && households.data.data.total_households === 1 && households.data.data.total_population !== 99, 'demographic counts scoped');
  const report = { household_id: 2, disaster_type: 'Flood', severity: 'Medium', location: 'Purok 1', report_date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date()), description: 'Outside report' };
  const outsideReport = await call('disasters/create_report.php', 'POST', report, admin);
  check(outsideReport.status === 201, 'outside report fixture created');
  check((await call('disasters/get_reports.php', 'GET', undefined, officer)).data.data.length === 0, 'outside disaster reports excluded');
  check((await call('disasters/create_report.php', 'POST', report, officer)).status === 403, 'outside disaster report creation denied');
  check((await call('disasters/get_damage_assessment.php?report_id=' + outsideReport.data.report_id, 'GET', undefined, officer)).status === 403, 'outside assessment denied');
  const map = await call('households/purok_classification.php', 'GET', undefined, officer);
  check(map.data.summary.households === 1 && map.data.households.every(h => h.stored_purok === 'Purok 3'), 'map household records and totals restricted to relief Purok');
  check((await call('disasters/create_report.php', 'POST', { ...report, household_id: 1, location: 'Purok 3' }, officer)).status === 201, 'inside disaster report creation allowed');
  check((await call('relief/distribute.php', 'POST', { allocation_id: 2 }, officer)).status === 410, 'old distribution path retired');
  check((await call('allocations/get.php?id=2', 'GET', undefined, officer)).status === 404, 'outside Ready allocation hidden');
  check((await call('allocations/complete.php', 'POST', { allocation_id: 2, completion_key: 'scope-test-0001', items: [{ allocation_item_id: 2, released_qty: 1 }] }, officer)).status === 404, 'outside allocation completion denied');
  const ready = { allocation_ids: [1,2], distribution_date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date()), location: 'Distribution center', confirmed: true };
  check((await call('relief/mark_ready.php', 'POST', ready, officer)).status === 410, 'manual mark-ready retired');
  check((await call('relief/get_allocations.php', 'GET', undefined, admin)).data.data.every(a => !a.ready_at && a.status === 'Approved'), 'rejected operations leave all allocations unchanged');
  for (const [path, data] of [
    ['relief/schedules/verify_beneficiary.php', { beneficiary_id: 2 }],
    ['relief/schedules/update_beneficiary_status.php', { beneficiary_id: 2, status: 'Prepared' }],
    ['households/update_coordinates.php', { household_id: 2, latitude: 13.15, longitude: 123.75 }],
  ]) check((await call(path, 'POST', data, officer)).status === 403, 'outside record change denied: ' + path);
  check((await call('relief/schedules/verify_beneficiary.php', 'POST', { beneficiary_id: 1 }, officer)).status === 200, 'inside beneficiary verification allowed');
  check((await call('allocations/complete.php', 'POST', { allocation_id: 1, completion_key: 'scope-test-0002', items: [{ allocation_item_id: 1, released_qty: 1 }] }, officer)).status === 200, 'inside allocation distribution allowed');
  sql(`UPDATE distribution_beneficiaries SET status='Delivered';
    INSERT INTO delivery_reports (beneficiary_id,recipient_name,submitted_by) SELECT beneficiary_id,'Recipient', (SELECT user_id FROM users WHERE email='personnel@example.test') FROM distribution_beneficiaries;
    INSERT INTO delivery_report_photos (report_id,file_path) VALUES (2,'uploads/delivery/2/scope.png');`);
  check((await call('relief/delivery/get_completed_deliveries.php','GET',undefined,officer)).data.data.length === 1, 'completed deliveries scoped');
  check((await call('relief/delivery/get_delivery_report.php?beneficiary_id=2','GET',undefined,officer)).status === 403, 'outside delivery report denied');
  check((await call('relief/delivery/get_delivery_report.php?beneficiary_id=1','GET',undefined,officer)).status === 200, 'inside delivery report allowed');
  for (const path of ['relief/delivery/view_photo.php?path=uploads/delivery/2/scope.png','uploads/delivery/2/scope.png']) check((await fetch(base + path,{headers:{Cookie:officer}})).status === 403,'outside delivery photo protected: '+path);
  const upload = new FormData(); upload.set('report_id',2);
  check((await fetch(base+'relief/delivery/upload_delivery_photo.php',{method:'POST',headers:{Cookie:officer},body:upload})).status === 403,'outside delivery photo upload denied');
  const row = (await call('users/get_users.php?managed=1&tab=all&role=relief_personnel','GET',undefined,admin)).data.data.find(r=>r.email==='personnel@example.test');
  check((await call('users/update_user.php','PUT',{user_id:row.user_id,full_name:row.full_name,email:row.email,role:row.role,contact_number:row.contact_number||'',assigned_purok:'Purok 1',version:row.version},admin)).status===200,'admin can reassign relief officer');
  const reassigned = await call('households/get_households.php','GET',undefined,officer);
  check(reassigned.data.data.length===1 && reassigned.data.data[0].purok==='Purok 1','existing session follows new assignment');
  check((await call('relief/delivery/get_delivery_report.php?beneficiary_id=1','GET',undefined,officer)).status===403,'old Purok access revoked immediately');
  check((await call('users/update_my_profile.php','POST',{assigned_purok:'Purok 3'},officer)).status===403,'officer cannot reassign themselves');
  sql("UPDATE users SET assigned_purok=NULL WHERE email='personnel@example.test'");
  check((await call('households/get_households.php','GET',undefined,officer)).status===403,'unassigned legacy relief officer blocked');
  const unassigned = await call('auth/login.php','POST',{email:'personnel@example.test',password:fixture.password});
  check(unassigned.status===403 && unassigned.data.reason==='purok_unassigned','unassigned login explains admin assignment required');
  check((await call('households/get_households.php','GET',undefined,admin)).data.data.length===2,'admin retains all Puroks');
  console.log(`PASS: ${checks} relief Purok checks (${fixture.database})`);
} finally { server.kill(); }

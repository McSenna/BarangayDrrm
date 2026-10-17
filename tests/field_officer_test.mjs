import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
const php = process.env.PHP_BIN || 'C:/xampp/php/php.exe';
const fixture = JSON.parse(execFileSync(php, ['tests/user_management_fixture.php'], { encoding: 'utf8', env: { ...process.env, USER_TEST_FULL_SCHEMA: '1' } }));
const base = 'http://127.0.0.1:8105/backend/';
const server = spawn(php, ['-S', '127.0.0.1:8105', '-t', '.', 'backend/dev_router.php'], { env: { ...process.env, DB_HOST: '127.0.0.1', DB_NAME: fixture.database }, stdio: 'ignore' });
let checks = 0;
const check = (value, label) => { assert.ok(value, label); checks++; console.log(`PASS ${label}`); };
async function call(path, method = 'GET', data, cookie) {
  const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: data ? JSON.stringify(data) : undefined });
  const text = await res.text();
  return { status: res.status, data: JSON.parse(text), cookie: res.headers.get('set-cookie')?.split(';')[0] };
}
try {
  for (let n = 0; n < 50; n++) { try { await fetch(base + 'auth/session.php'); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
  const admin = await call('auth/login.php', 'POST', { email: 'admin@example.test', password: fixture.password });
  check((await call('users/add_user.php', 'POST', { full_name: 'Unassigned', email: 'unassigned@example.test', password: fixture.password, role: 'field_officer' }, admin.cookie)).status === 400, 'field officer requires assigned Purok');
  const created = await call('users/add_user.php', 'POST', { full_name: 'Test Field Officer', email: 'field@example.test', password: fixture.password, role: 'field_officer', assigned_purok: 'Purok 3' }, admin.cookie);
  check(created.status === 201, 'administrator creates field officer');
  const login = await call('auth/login.php', 'POST', { email: 'field@example.test', password: fixture.password });
  check(login.status === 200 && login.data.user.role === 'field_officer', 'field officer signs in with persisted role');
  const field = login.cookie;
  check(login.data.user.assigned_purok === 'Purok 3', 'sign-in includes assigned Purok');
  const otherHousehold = await call('households/add_household.php', 'POST', {
    head_of_family: 'Outside Purok Household', purok: 'Purok 1', address: 'Outside Street', number_of_members: 2, latitude: null, longitude: null,
  }, admin.cookie);
  check(otherHousehold.status === 201 || otherHousehold.status === 200, 'outside-scope household fixture created');
  const allHouseholds = (await call('households/get_households.php', 'GET', undefined, admin.cookie)).data.data;
  const outside = allHouseholds.find((h) => h.purok === 'Purok 1');
  const inside = allHouseholds.find((h) => h.purok === 'Purok 3');
  const reportData = { household_id: outside.household_id, disaster_type: 'Flood', severity: 'Medium', location: 'Purok 1', report_date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date()), description: 'Out-of-scope report' };
  const outsideReport = await call('disasters/create_report.php', 'POST', reportData, admin.cookie);
  check(outsideReport.status === 201, 'outside-scope report fixture created');
  const outsideReportId = outsideReport.data.report_id;
  for (const purok of ['Purok 1', 'Purok 3', '']) await call('hazards/alerts/add_alert.php', 'POST', { hazard_type: 'Flood', title: purok || 'Barangay-wide alert', status: 'Alert', affected_purok: purok }, admin.cookie);
  const scopedAlerts = await call('hazards/alerts/get_alerts.php', 'GET', undefined, field);
  check(scopedAlerts.data.data.length === 2 && scopedAlerts.data.data.every((a) => !a.affected_purok || a.affected_purok === 'Purok 3'), 'hazards restricted to assigned Purok plus barangay-wide advisories');
  const outsidePhotoPath = `uploads/reports/${outsideReportId}/scope-fixture.png`;
  const outsidePhotoId = Number(execFileSync(php, ['-r', "$p = new PDO('mysql:host=127.0.0.1;dbname=' . $argv[1], getenv('DB_USER') ?: 'root', getenv('DB_PASS') ?: ''); $s = $p->prepare('INSERT INTO report_photos (report_id, file_path) VALUES (?, ?)'); $s->execute([$argv[2], $argv[3]]); echo $p->lastInsertId();", fixture.database, String(outsideReportId), outsidePhotoPath], { encoding: 'utf8' }));
  check((await call('disasters/delete_photo.php', 'DELETE', { photo_id: outsidePhotoId }, field)).status === 403, 'outside photo deletion denied');
  check((await fetch(base + 'disasters/view_photo.php?path=' + encodeURIComponent(outsidePhotoPath), { headers: { Cookie: field } })).status === 403, 'outside photo content denied');
  check((await fetch(base + outsidePhotoPath, { headers: { Cookie: field } })).status === 403, 'direct photo URL cannot bypass Purok scope');
  check((await call('households/get_households.php', 'GET', undefined, field)).data.data.every((h) => h.purok === 'Purok 3'), 'household list restricted to assigned Purok');
  check((await call('households/get_households.php?purok=Purok%201', 'GET', undefined, field)).data.data.length === 0, 'query Purok cannot override assignment');
  check((await call('households/members/get_members.php?household_id=' + outside.household_id, 'GET', undefined, field)).status === 403, 'outside family members denied');
  check((await call('disasters/get_reports.php', 'GET', undefined, field)).data.data.length === 0, 'outside reports excluded from list');
  check((await call('disasters/create_report.php', 'POST', reportData, field)).status === 403, 'outside report creation denied');
  check((await call('disasters/update_report.php', 'POST', { ...reportData, report_id: outsideReportId }, field)).status === 403, 'outside report edits denied');
  check((await call('disasters/save_damage_assessment.php', 'POST', { report_id: outsideReportId }, field)).status === 403, 'outside assessment changes denied');
  for (const endpoint of ['get_damage_assessment.php', 'get_report_photos.php']) check((await call('disasters/' + endpoint + '?report_id=' + outsideReportId, 'GET', undefined, field)).status === 403, 'outside report detail denied: ' + endpoint);
  const upload = new FormData(); upload.set('report_id', outsideReportId);
  check((await fetch(base + 'disasters/upload_photos.php', { method: 'POST', headers: { Cookie: field }, body: upload })).status === 403, 'outside photo upload denied before processing files');
  const mapData = await call('households/purok_classification.php', 'GET', undefined, field);
  check(mapData.data.summary.households === 1 && mapData.data.households.every((h) => h.stored_purok === 'Purok 3'), 'map household data and counts scoped');
  const affected = await call('hazards/areas/get_affected_households.php', 'GET', undefined, field);
  check(affected.data.summary.total_households === 1 && affected.data.missing_coordinates.every((h) => h.purok === 'Purok 3'), 'affected-household data and counts scoped');
  check((await call('dashboard/priority_list.php', 'GET', undefined, field)).data.data.every((h) => h.purok === 'Purok 3'), 'DSS does not reveal other Puroks');
  check((await call('users/update_my_profile.php', 'POST', { assigned_purok: 'Purok 1' }, field)).status === 403, 'field officer cannot reassign themselves');
  const listing = await call('users/get_users.php?managed=1&tab=all&role=field_officer', 'GET', undefined, admin.cookie);
  check(listing.data.pagination.total === 1 && listing.data.data[0].display_role === 'Field Officer', 'field officer list and display role');
  check(listing.data.data[0].assigned_purok === 'Purok 3', 'assigned Purok persists');
  check((await call('users/get_users.php?role=field_officer', 'GET', undefined, admin.cookie)).data.data.length === 1, 'field officer management list');
  for (const path of ['users/get_my_profile.php', 'households/get_households.php', 'households/purok_classification.php', 'dashboard/priority_list.php', 'disasters/get_reports.php', 'disasters/events/get_events.php', 'settings/disaster_types/get_types.php', 'hazards/alerts/get_alerts.php', 'hazards/areas/get_affected_households.php', 'evacuation/get_centers.php']) {
    check((await call(path, 'GET', undefined, field)).status === 200, `field officer can read ${path}`);
  }
  for (const [path, method] of [['users/add_user.php','POST'], ['users/update_user.php','PUT'], ['users/toggle_status.php','POST'], ['users/review_registration.php','POST'], ['users/get_users.php?managed=1','GET'], ['households/add_household.php','POST'], ['households/update_household.php','PUT'], ['households/update_coordinates.php','POST'], ['disasters/verify_report.php','POST'], ['disasters/reject_report.php','POST'], ['relief/distribute.php','POST'], ['relief/mark_ready.php','POST'], ['relief/get_allocations.php','GET'], ['inventory/stock_out.php','POST']]) {
    const retired = ['relief/distribute.php', 'relief/mark_ready.php'].includes(path);
    check((await call(path, method, method === 'GET' ? undefined : {}, field)).status === (retired ? 410 : 403), `field officer denied ${path}`);
  }
  const households = await call('households/get_households.php', 'GET', undefined, field);
  const report = { household_id: households.data.data[0].household_id, disaster_type: 'Flood', severity: 'Medium', location: 'Purok 3', description: 'Field observation', report_date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date()), collection_method: 'Field Visit' };
  const recorded = await call('disasters/create_report.php', 'POST', report, field);
  check(recorded.status === 201 || recorded.status === 200, 'field officer records disaster report');
  const reports = await call('disasters/get_reports.php', 'GET', undefined, field);
  const saved = reports.data.data.find((row) => Number(row.user_id) === Number(created.data.user_id));
  check(Boolean(saved) && saved.status === 'Pending', 'recorded report awaits admin verification');
  check((await call('disasters/save_damage_assessment.php', 'POST', { report_id: saved.report_id, house_damage: 'Minor' }, field)).status === 403, 'unassigned officer cannot save assessment');
  const assignment = await call('disasters/assign_household_assessment.php', 'POST', { household_id: saved.household_id, assigned_field_officer_id: created.data.user_id, version: 0 }, admin.cookie);
  check(assignment.status === 200, 'admin assigns household visit');
  check((await call('disasters/submit_household_assessment.php', 'POST', { household_id: saved.household_id, version: assignment.data.data.version, field_visit_date: report.report_date, damage_classification: 'Minor Damage', estimated_severity: 'Medium', findings: 'Visited the household and observed minor damage.' }, field)).status === 200, 'assigned field officer saves actual visit assessment');
  check((await call('disasters/list_household_assessments.php?household_id=' + saved.household_id, 'GET', undefined, field)).data.data[0].damage_classification === 'Minor Damage', 'household visit assessment persists');
  let row = listing.data.data[0];
  const edit = { user_id: row.user_id, full_name: row.full_name, email: row.email, role: row.role, contact_number: row.contact_number || '', assigned_purok: 'Purok 1', version: row.version };
  check((await call('users/update_user.php', 'PUT', edit, admin.cookie)).status === 200, 'admin reassigns officer to Purok 1');
  check((await call('households/get_households.php', 'GET', undefined, field)).data.data.every((h) => h.purok === 'Purok 1'), 'existing session immediately follows new assignment');
  check((await call('disasters/save_damage_assessment.php', 'POST', { report_id: saved.report_id }, field)).status === 403, 'previous Purok access revoked after reassignment');
  check((await call('disasters/get_reports.php', 'GET', undefined, field)).data.data.every((r) => Number(r.report_id) === Number(outsideReportId)), 'reassigned officer sees only new Purok reports');
  check((await call('users/update_user.php', 'PUT', { ...edit, assigned_purok: 'Purok 3' }, admin.cookie)).status === 409, 'stale assignment changes rejected');
  row = (await call('users/get_users.php?managed=1&tab=all&role=field_officer', 'GET', undefined, admin.cookie)).data.data[0];
  check((await call('users/toggle_status.php', 'POST', { user_id: row.user_id, is_active: 0, version: row.version }, admin.cookie)).status === 200, 'admin deactivates field officer');
  check((await call('households/get_households.php', 'GET', undefined, field)).status === 401, 'field officer session revoked on deactivation');
  check((await call('users/toggle_status.php', 'POST', { user_id: row.user_id, is_active: 1 }, admin.cookie)).status === 200, 'admin reactivates field officer');
  const revived = await call('auth/login.php', 'POST', { email: 'field@example.test', password: fixture.password });
  check(revived.status === 200, 'reactivated field officer signs in');
  const registration = await call('auth/register.php', 'POST', { full_name: 'Public Registration', email: 'publicfield@example.test', password: fixture.password, role: 'field_officer' });
  const pending = await call('users/get_users.php?managed=1&tab=requests', 'GET', undefined, admin.cookie);
  check(registration.status === 201 && pending.data.data[0].role === 'resident', 'public registration cannot create field officers');
  execFileSync(php, ['-r', "$p = new PDO('mysql:host=127.0.0.1;dbname=' . $argv[1], getenv('DB_USER') ?: 'root', getenv('DB_PASS') ?: ''); $s = $p->prepare('UPDATE users SET assigned_purok = NULL WHERE user_id = ?'); $s->execute([$argv[2]]);", fixture.database, String(row.user_id)]);
  check((await call('households/get_households.php', 'GET', undefined, revived.cookie)).status === 403, 'unassigned legacy officer has no record access');
  check((await call('auth/login.php', 'POST', { email: 'field@example.test', password: fixture.password })).status === 403, 'unassigned legacy officer cannot sign in');
  check((await call('auth/session.php', 'GET', undefined, revived.cookie)).data.authenticated === false, 'unassigned legacy session is invalidated');
  console.log(`PASS: ${checks} field officer checks (${fixture.database})`);
} finally { server.kill(); }

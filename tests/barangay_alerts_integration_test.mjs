// Barangay alert API over HTTP (php -S on a NEW isolated fixture database): authorization, CSRF origin check,
// create -> activate -> turn off, public active-alert filtering, idempotent turn-off, drafts hidden from staff.
// Usage: node tests/barangay_alerts_integration_test.mjs   (PHP_BIN defaults to C:/xampp/php/php.exe)
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
const php = process.env.PHP_BIN || 'C:/xampp/php/php.exe';
const fixture = JSON.parse(execFileSync(php, ['tests/user_management_fixture.php'], { encoding: 'utf8', env: { ...process.env, USER_TEST_FULL_SCHEMA: '1' } }));
const dbArgs = `mysql:host=127.0.0.1;dbname=${fixture.database};charset=utf8mb4`;
const sql = (code) => execFileSync(php, ['-r', `$db = new PDO('${dbArgs}', 'root', '', [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]); ${code}`], { encoding: 'utf8' });
sql(`$db->exec(file_get_contents('database/migration_phase33_barangay_alerts.sql'));`);
const port = Number(process.env.ALERT_TEST_PORT || 8098);
const base = `http://127.0.0.1:${port}/backend/`;
const server = spawn(php, ['-S', `127.0.0.1:${port}`, '-t', '.'], { env: { ...process.env, DB_HOST: '127.0.0.1', DB_NAME: fixture.database }, stdio: 'ignore' });
let checks = 0;
const check = (value, label) => { assert.ok(value, label); checks++; console.log(`PASS ${label}`); };
async function call(path, method = 'GET', body, cookie = '', headers = {}) {
  const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data = null; try { data = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, text, data, cookie: res.headers.get('set-cookie')?.split(';')[0], cache: res.headers.get('cache-control') };
}
async function login(email) { const res = await call('auth/login.php', 'POST', { email, password: fixture.password }); assert.equal(res.status, 200, res.text); return res.cookie; }
const A = 'hazards/alerts/';
const content = { title: 'Rising water along the river', hazard_type: 'Flood', severity: 'Warning', description: 'Water is rising.', instructions: 'Move to higher ground.', scope: 'puroks', puroks: ['Purok 1', 'Purok 3'] };
const historyCount = (id, action) => Number(sql(`echo $db->query("SELECT COUNT(*) FROM hazard_alert_history WHERE alert_id=${Number(id)} AND action='${action}'")->fetchColumn();`));
try {
  for (let n = 0; n < 50; n++) { try { await fetch(base + 'auth/session.php'); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
  const admin = await login('admin@example.test');
  const resident = await login('resident@example.test');
  const personnel = await login('personnel@example.test');

  // ---- authorization: only administrators change alerts
  const writes = [['save_alert.php', 'POST', content], ['save_alert.php', 'PUT', { ...content, alert_id: 1, version: 1 }], ['activate.php', 'POST', { alert_id: 1 }],
    ['deactivate.php', 'POST', { alert_id: 1 }], ['delete_alert.php', 'POST', { alert_id: 1 }], ['get_alert_history.php?alert_id=1', 'GET']];
  for (const [path, method, body] of writes) check((await call(A + path, method, body)).status === 401, `anonymous ${method} ${path} -> 401`);
  for (const [who, cookie] of [['resident', resident], ['personnel', personnel]]) {
    for (const [path, method, body] of writes) check((await call(A + path, method, body, cookie)).status === 403, `${who} ${method} ${path} -> 403`);
  }
  check((await call(A + 'save_alert.php', 'POST', content, admin, { Origin: 'http://evil.example' })).status === 403, 'cross-site origin refused');

  // ---- public endpoint: anonymous, never cached, empty list is an explicit success
  let pub = await call(A + 'get_active_alerts.php');
  check(pub.status === 200 && pub.data.success && Array.isArray(pub.data.data.alerts) && pub.data.data.alerts.length === 0 && pub.data.data.highest_severity === null, 'public: no active alerts');
  check(/no-store/.test(pub.cache || ''), 'public response is not cached');

  // ---- create + validation
  check((await call(A + 'save_alert.php', 'POST', { ...content, puroks: ['Purok 8'] }, admin)).status === 400, 'Purok 8 rejected');
  check((await call(A + 'save_alert.php', 'POST', { ...content, puroks: [] }, admin)).status === 400, 'selected-puroks scope with no purok rejected');
  check((await call(A + 'save_alert.php', 'POST', { ...content, alert_status: 'Active' }, admin)).status === 400, 'status cannot be set on create');
  const created = await call(A + 'save_alert.php', 'POST', content, admin);
  check(created.status === 201 && created.data.alert.alert_status === 'Draft', 'draft created');
  const purokId = created.data.alert.alert_id;
  const wide = (await call(A + 'save_alert.php', 'POST', { ...content, title: 'Typhoon signal no. 2', hazard_type: 'Typhoon', severity: 'Critical', scope: 'barangay', puroks: [] }, admin)).data.alert;

  // ---- drafts: hidden from the public and from non-admin staff
  check((await call(A + 'get_active_alerts.php')).data.data.alerts.length === 0, 'drafts are not public');
  const staffList = await call(A + 'get_alerts.php', 'GET', undefined, personnel);
  check(staffList.status === 200 && staffList.data.data.every((a) => a.alert_status !== 'Draft'), 'personnel list has no drafts');
  check((await call(A + 'get_alerts.php?state=Draft', 'GET', undefined, admin)).data.data.length === 2, 'admin sees both drafts');

  // ---- edit with version
  const edited = await call(A + 'save_alert.php', 'PUT', { ...content, instructions: 'Evacuate now.', alert_id: purokId, version: created.data.alert.version }, admin);
  check(edited.status === 200 && edited.data.alert.instructions === 'Evacuate now.', 'draft edited');
  check((await call(A + 'save_alert.php', 'PUT', { ...content, alert_id: purokId, version: created.data.alert.version }, admin)).status === 409, 'stale edit -> 409');

  // ---- activate both
  check((await call(A + 'activate.php', 'POST', { alert_id: purokId, severity: 'Critical' }, admin)).status === 400, 'activate refuses unrelated fields');
  const act = await call(A + 'activate.php', 'POST', { alert_id: purokId }, admin);
  check(act.status === 200 && act.data.alert.alert_status === 'Active' && act.data.already === false, 'selected-puroks alert activated');
  check((await call(A + 'activate.php', 'POST', { alert_id: wide.alert_id }, admin)).status === 200, 'barangay-wide alert activated');
  pub = (await call(A + 'get_active_alerts.php')).data.data;
  const pPurok = pub.alerts.find((a) => a.alert_id === purokId);
  const pWide = pub.alerts.find((a) => a.alert_id === wide.alert_id);
  check(pub.alerts.length === 2 && pub.highest_severity === 'Critical', 'public: both active, highest Critical');
  check(JSON.stringify(pPurok.puroks) === '["Purok 1","Purok 3"]' && pPurok.scope === 'puroks' && pPurok.instructions === 'Evacuate now.', 'public: selected puroks and instructions');
  check(pWide.scope === 'barangay' && pWide.puroks.length === 0, 'public: barangay-wide scope');
  check(pub.alerts[0].alert_id === wide.alert_id, 'public: Critical listed first');
  check(!('created_by' in pPurok) && !('issued_by_name' in pPurok) && !('resolution_note' in pPurok), 'public: no actor or internal fields');
  const status = (await call('hazards/get_public_status.php')).data.data;
  check(status.overall_status === 'Critical' && status.active_alerts.length === 2 && 'affected_purok' in status.active_alerts[0] && Array.isArray(status.active_alerts[0].puroks), 'public status: highest level, legacy keys kept, puroks added');

  // ---- turn off one; the other stays
  check((await call(A + 'deactivate.php', 'POST', { alert_id: purokId, title: 'changed' }, admin)).status === 400, 'turn-off refuses unrelated fields');
  const off = await call(A + 'deactivate.php', 'POST', { alert_id: purokId, resolution_note: 'Water receded.' }, admin);
  check(off.status === 200 && off.data.alert.alert_status === 'Inactive' && off.data.alert.resolution_note === 'Water receded.' && off.data.already === false, 'turned off with note');
  const again = await call(A + 'deactivate.php', 'POST', { alert_id: purokId }, admin);
  check(again.status === 200 && again.data.already === true, 'repeated turn-off is a no-op');
  check(historyCount(purokId, 'deactivated') === 1 && historyCount(purokId, 'activated') === 1, 'one activation and one deactivation in history');
  pub = (await call(A + 'get_active_alerts.php')).data.data;
  check(pub.alerts.length === 1 && pub.alerts[0].alert_id === wide.alert_id, 'other active alert still public');
  const hist = await call(A + `get_alert_history.php?alert_id=${purokId}`, 'GET', undefined, admin);
  check(hist.status === 200 && hist.data.data.alert.alert_status === 'Inactive' && hist.data.data.history.map((h) => h.action).join(',') === 'created,updated,activated,deactivated', 'history retained in order');
  check(hist.data.data.history.at(-1).note === 'Water receded.' && hist.data.data.history.at(-1).acted_by_name === 'Test Administrator', 'deactivation entry has actor and note');
  check((await call(A + 'activate.php', 'POST', { alert_id: purokId }, admin)).status === 409, 'turned-off alert cannot be reactivated');
  check((await call(A + 'delete_alert.php', 'POST', { alert_id: purokId }, admin)).status === 409, 'turned-off alert cannot be deleted');
  check((await call(A + 'get_alerts.php?state=Inactive', 'GET', undefined, admin)).data.data.some((a) => a.alert_id === purokId), 'inactive record listed as history');

  // ---- legacy endpoints route through the same rules
  const legacyResolve = await call(A + 'update_status.php', 'POST', { alert_id: wide.alert_id, resolve: true }, admin);
  check(legacyResolve.status === 200 && historyCount(wide.alert_id, 'deactivated') === 1, 'legacy resolve uses the turn-off rules');
  check((await call(A + 'get_active_alerts.php')).data.data.alerts.length === 0, 'no active alerts after both are off');
  console.log(`ALL ${checks} CHECKS PASSED`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  server.kill();
  execFileSync(php, ['-r', `(new PDO('mysql:host=127.0.0.1', 'root', ''))->exec('DROP DATABASE IF EXISTS \`${fixture.database}\`');`]);
}

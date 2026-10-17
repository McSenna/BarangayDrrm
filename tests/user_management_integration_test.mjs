import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
const php = process.env.PHP_BIN || 'C:/xampp/php/php.exe';
const fixture = JSON.parse(execFileSync(php, ['tests/user_management_fixture.php'], { encoding: 'utf8' }));
const port = Number(process.env.USER_TEST_PORT || 8097);
const base = `http://127.0.0.1:${port}/backend/`;
const server = spawn(php, ['-S', `127.0.0.1:${port}`, '-t', '.'], { env: { ...process.env, DB_HOST: '127.0.0.1', DB_NAME: fixture.database }, stdio: 'ignore' });
let checks = 0;
const check = (value, label) => { assert.ok(value, label); checks++; console.log(`PASS ${label}`); };
async function call(path, method = 'GET', body, cookie = '') {
  const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  return { status: res.status, text, data: res.headers.get('content-type')?.includes('json') ? JSON.parse(text) : null, cookie: res.headers.get('set-cookie')?.split(';')[0] };
}
async function login(email) { const res = await call('auth/login.php', 'POST', { email, password: fixture.password }); assert.equal(res.status, 200, res.text); return res.cookie; }
try {
  for (let n = 0; n < 50; n++) { try { await fetch(base + 'auth/session.php'); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
  check((await call('users/get_users.php?managed=1')).status === 401, 'anonymous listing denied');
  const admin = await login('admin@example.test');
  const resident = await login('resident@example.test');
  const personnel = await login('personnel@example.test');
  for (const cookie of [resident, personnel]) for (const [path, method, body] of [
    ['get_users.php?managed=1', 'GET'], ['get_users.php?managed=1&export=csv', 'GET'], ['add_user.php', 'POST', {}], ['update_user.php', 'PUT', {}], ['toggle_status.php', 'POST', {}], ['get_user.php?user_id=1', 'GET'], ['delete_user.php', 'DELETE', {}],
  ]) check((await call('users/' + path, method, body, cookie)).status === 403, `${cookie === resident ? 'resident' : 'personnel'} denied ${path}`);
  const list = async (query = '') => (await call('users/get_users.php?managed=1&tab=all' + query, 'GET', undefined, admin)).data;
  let all = await list();
  check(all.summary.total === 5 && all.summary.active === 4 && all.summary.inactive === 1, 'real global counts');
  check(all.data.every((r) => !('password' in r) && !('token' in r)), 'safe response fields');
  const linked = all.data.find((r) => r.email === 'resident@example.test');
  check(linked.display_role === 'Head of the family' && linked.role === 'resident', 'linked household account displays head designation with resident permissions');
  check((await list('&role=head_of_family')).pagination.total === 1, 'household-head role filter');
  check((await list('&search=Test%20street&role=resident&status=active')).pagination.total === 1, 'combined location role status filters');
  check((await list('&search=%25')).pagination.total === 0, 'search treats percent literally');
  check((await list('&page=999')).pagination.page === 1, 'page clamps');
  check((await list('&sort=last_login&direction=asc')).data.at(-1).last_login === null, 'never logged in sorts last');
  check((await call('users/get_users.php?role=resident', 'GET', undefined, admin)).data.data.length === 2, 'legacy unpaged listing');
  const own = all.data.find((r) => r.email === 'admin@example.test');
  const other = all.data.find((r) => r.email === 'second@example.test');
  const target = all.data.find((r) => r.email === 'resident@example.test');
  const profile = (r) => ({ user_id: r.user_id, full_name: r.full_name, email: r.email, role: r.role, contact_number: r.contact_number || '', assigned_purok: r.assigned_purok || '', version: r.version });
  check((await call('users/update_user.php', 'PUT', { ...profile(own), role: 'resident' }, admin)).status === 409, 'self demotion denied');
  check((await call('users/toggle_status.php', 'POST', { user_id: own.user_id, is_active: 0 }, admin)).status === 409, 'self deactivation denied');
  check((await call('users/update_user.php', 'PUT', { ...profile(target), is_active: 0 }, admin)).status === 400, 'administrative field injection denied');
  check((await call('users/update_user.php', 'PUT', { ...profile(target), user_id: 999999 }, admin)).status === 404, 'missing account handled');
  const create = { full_name: '=SUM(A1)', email: 'new@example.test', password: 'TestPassword12', role: 'resident' };
  check((await call('users/add_user.php', 'POST', { ...create, email: 'invalid' }, admin)).status === 400, 'create email validation');
  check((await call('users/add_user.php', 'POST', create, admin)).status === 201, 'create persists');
  check((await call('users/add_user.php', 'POST', { ...create, email: 'NEW@example.test' }, admin)).status === 409, 'case insensitive duplicate');
  check((await call('users/update_user.php', 'PUT', { ...profile(target), email: own.email }, admin)).status === 409, 'duplicate edit');
  check((await call('users/update_user.php', 'PUT', { ...profile(target), full_name: 'Edited Resident' }, admin)).status === 200, 'edit persists');
  check((await call('users/update_user.php', 'PUT', profile(target), admin)).status === 409, 'stale edit rejected');
  let fresh = (await list()).data.find((r) => r.user_id === target.user_id);
  check(fresh.full_name === 'Edited Resident', 'reload shows persisted edit');
  check((await call('users/toggle_status.php', 'POST', { user_id: target.user_id, is_active: 0, version: fresh.version }, admin)).status === 200, 'deactivation succeeds');
  const deactivatedHead = (await list()).data.find((r) => r.user_id === target.user_id);
  check(deactivatedHead && Number(deactivatedHead.is_active) === 0 && deactivatedHead.display_role === 'Head of the family', 'All accounts retains deactivated household heads');
  check((await call('users/get_my_profile.php', 'GET', undefined, resident)).status === 401, 'existing resident session revoked');
  check((await call('auth/login.php', 'POST', { email: target.email, password: fixture.password })).status === 403, 'inactive login denied');
  check((await call('users/toggle_status.php', 'POST', { user_id: target.user_id, is_active: 1 }, admin)).status === 200, 'reactivation succeeds');
  check(Boolean(await login(target.email)), 'reactivated account signs in');
  check((await call('users/toggle_status.php', 'POST', { user_id: other.user_id, is_active: 0 }, admin)).status === 200, 'other admin can be disabled');
  check((await call('users/toggle_status.php', 'POST', { user_id: own.user_id, is_active: 0 }, admin)).status === 409, 'remaining admin protected');
  const registered = await call('auth/register.php', 'POST', { full_name: 'Registered Resident', email: 'registered@example.test', password: fixture.password, role: 'admin' });
  check(registered.status === 201 && registered.data.registration_status === 'pending', 'registration waits for approval');
  check((await list()).data.find((r) => r.email === 'registered@example.test').role === 'resident', 'registration cannot escalate role');
  const applicant = (await list()).data.find((r) => r.email === 'registered@example.test');
  check((await call('users/review_registration.php', 'POST', { user_id: applicant.user_id, decision: 'approved', version: applicant.version }, admin)).status === 200, 'administrator approves registration');
  for (let n = 0; n < 12; n++) assert.equal((await call('users/add_user.php', 'POST', { ...create, full_name: `Paged ${n}`, email: `paged${n}@example.test` }, admin)).status, 201);
  const paged = await list('&per_page=10');
  check(paged.data.length === 10 && paged.pagination.total === 19, 'server pagination');
  const next = await list('&per_page=10&page=2');
  check(next.data.length === 9 && !next.data.some((r) => paged.data.some((p) => p.user_id === r.user_id)), 'stable pages without overlap');
  const csv = await call('users/get_users.php?managed=1&tab=all&export=csv&per_page=10', 'GET', undefined, admin);
  check(csv.status === 200 && csv.text.trim().split('\n').length === 20, 'CSV exports all filtered pages');
  check(csv.text.includes("'=SUM(A1)") && !csv.text.includes('TestPassword12'), 'CSV formula neutralization and no secrets');
  check(csv.text.includes('Head of the family'), 'CSV preserves household-head designation');
  const selected = await call(`users/get_users.php?managed=1&tab=all&export=csv&ids=${own.user_id}`, 'GET', undefined, admin);
  check(selected.text.trim().split('\n').length === 2, 'selected CSV scope');
  check((await call('users/get_users.php?managed=1&sort=password', 'GET', undefined, admin)).status === 400, 'invalid sorting rejected');
  check((await call('users/add_user.php', 'GET', undefined, admin)).status === 405, 'mutation method enforced');
  check((await call('users/list_managed.php')).status === 401, 'direct managed endpoint protected');
  const legacy = (await call('users/get_users.php?role=relief_personnel', 'GET', undefined, admin)).data.data[0];
  check(typeof legacy.version === 'string', 'legacy screens receive edit versions');
  check((await call('users/update_user.php', 'PUT', { ...profile(legacy), role: 'admin', assigned_purok: '' }, admin)).status === 200, 'personnel promotion');
  check((await call('users/update_user.php', 'PUT', { ...profile(legacy), password: '' }, admin)).status === 409, 'stale personnel form cannot undo promotion');
  // Restore two active admins, then race requests on independent PHP processes.
  await call('users/update_user.php', 'PUT', { ...profile(legacy), version: undefined }, admin);
  await call('users/toggle_status.php', 'POST', { user_id: other.user_id, is_active: 1 }, admin);
  const second = await login(other.email);
  const parallel = spawn(php, ['-S', `127.0.0.1:${port + 1}`, '-t', '.'], { env: { ...process.env, DB_HOST: '127.0.0.1', DB_NAME: fixture.database }, stdio: 'ignore' });
  try {
    for (let n = 0; n < 50; n++) { try { await fetch(`http://127.0.0.1:${port + 1}/backend/auth/session.php`); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
    const race = await Promise.all([
      call('users/toggle_status.php', 'POST', { user_id: other.user_id, is_active: 0 }, admin),
      fetch(`http://127.0.0.1:${port + 1}/backend/users/toggle_status.php`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: second }, body: JSON.stringify({ user_id: own.user_id, is_active: 0 }) }),
    ]);
    check(race.filter((r) => r.status === 200).length === 1, 'concurrent administrators cannot disable each other');
    check(race.some((r) => [401, 403, 409].includes(r.status)), 'losing concurrent actor rejected');
    if (race[1].status === 200) await call('users/toggle_status.php', 'POST', { user_id: own.user_id, is_active: 1 }, second);
  } finally { parallel.kill(); }
  mkdirSync('tests/.user-management-local', { recursive: true });
  writeFileSync('tests/.user-management-local/fixture.json', JSON.stringify({ ...fixture, base }));
  console.log(`PASS: ${checks} HTTP integration checks. Isolated database retained: ${fixture.database}`);
} finally { server.kill(); }

import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
const php = process.env.PHP_BIN || 'C:/xampp/php/php.exe';
const fixture = JSON.parse(execFileSync(php, ['tests/user_management_fixture.php'], { encoding: 'utf8', env: { ...process.env, SKIP_REGISTRATION_MIGRATION: '1' } }));
const env = { ...process.env, DB_HOST: '127.0.0.1', DB_NAME: fixture.database };
const server = spawn(php, ['-S', '127.0.0.1:8101', '-t', '.'], { env, stdio: 'ignore' });
const base = 'http://127.0.0.1:8101/backend/';
const post = (path, data) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
try {
  for (let n = 0; n < 50; n++) { try { await fetch(base + 'auth/session.php'); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
  const credentials = { email: 'resident@example.test', password: fixture.password };
  const applicant = { email: 'migration@example.test', password: fixture.password, full_name: 'Migration Applicant' };
  assert.equal((await post('auth/login.php', credentials)).status, 200);
  assert.equal((await post('auth/register.php', applicant)).status, 503);
  console.log('PASS pre-migration existing login works and new registration fails closed');
  for (let n = 0; n < 2; n++) execFileSync(php, ['database/apply_registration_migration.php'], { env, encoding: 'utf8' });
  assert.equal((await post('auth/login.php', credentials)).status, 200);
  assert.equal((await post('auth/register.php', applicant)).status, 201);
  assert.equal((await post('auth/login.php', applicant)).status, 403);
  console.log(`PASS migration is repeatable, existing login preserved, new requests require approval (${fixture.database})`);
} finally { server.kill(); }

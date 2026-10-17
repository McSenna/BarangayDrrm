// Relief allocation workflow in the browser: field officer (phone) → Ready → Relief Personnel completion (phone),
// administrator re-open (desktop). Isolated fixture database; screenshots in tests/.user-management-local/.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/Users/Rivest/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const phpBin = process.env.PHP_BIN || 'C:/xampp/php/php.exe';
const fixture = JSON.parse(execFileSync(phpBin, ['tests/user_management_fixture.php'], { encoding: 'utf8', env: { ...process.env, USER_TEST_FULL_SCHEMA: '1' } }));
if (!/^codex_users_test_\d{8}_\d{6}_[a-f0-9]+$/.test(fixture.database)) throw new Error('Isolated fixture database required');
const origin = 'http://127.0.0.1:5189', base = 'http://127.0.0.1:8125/backend/';
const php = spawn(phpBin, ['-S', '127.0.0.1:8125', '-t', '.', 'backend/dev_router.php'], { env: { ...process.env, DB_HOST: '127.0.0.1', DB_NAME: fixture.database, CORS_ALLOWED_ORIGINS: origin }, stdio: 'ignore' });
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5189', '--strictPort'], { cwd: 'frontend', env: { ...process.env, VITE_API_BASE_URL: base }, stdio: 'ignore' });
const sqlScript = "$p=new PDO('mysql:host=127.0.0.1;dbname='.$argv[1],getenv('DB_USER')?:'root',getenv('DB_PASS')?:'',[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);";
const sql = (q) => execFileSync(phpBin, ['-r', sqlScript + '$p->exec($argv[2]);', fixture.database, q], { encoding: 'utf8' });
const num = (q) => Number(JSON.parse(execFileSync(phpBin, ['-r', sqlScript + 'echo json_encode($p->query($argv[2])->fetchColumn());', fixture.database, q], { encoding: 'utf8' })));
const shots = 'tests/.user-management-local';
let browser, checks = 0;
const check = (ok, label) => { assert.ok(ok, label); checks++; console.log('PASS ' + label); };
const fits = (page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
async function session(email, viewport) {
  const context = await browser.newContext({ viewport });
  assert.equal((await context.request.post(base + 'auth/login.php', { data: { email, password: fixture.password } })).status(), 200, 'login ' + email);
  const page = await context.newPage(); page.errors = []; page.on('pageerror', (e) => page.errors.push(e.message));
  return { context, page };
}
try {
  for (let n = 0; n < 120; n++) { try { await fetch(origin); await fetch(base + 'auth/session.php'); break; } catch { await new Promise((r) => setTimeout(r, 150)); } }
  mkdirSync(shots, { recursive: true });
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const hash = execFileSync(phpBin, ['-r', 'echo password_hash($argv[1], PASSWORD_DEFAULT);', fixture.password], { encoding: 'utf8' });
  sql(`INSERT INTO users (full_name,email,password,role,is_active,assigned_purok) VALUES ('Field Officer','officer@example.test','${hash}','field_officer',1,'Purok 3')`);
  const officerId = num("SELECT user_id FROM users WHERE email='officer@example.test'");
  const adminId = num("SELECT user_id FROM users WHERE email='admin@example.test'");
  sql("INSERT INTO relief_items (item_id,item_name,category,quantity,unit) VALUES (911,'Rice 5kg','Food',10,'sack'),(912,'Water 1L','Water',40,'bottle')");
  sql(`INSERT INTO relief_packages (package_id,package_name,is_active,created_by) VALUES (95,'Family pack',1,${adminId}); INSERT INTO relief_package_items (package_id,item_id,quantity) VALUES (95,911,2),(95,912,6)`);

  const admin = await session('admin@example.test', { width: 1440, height: 900 });
  const api = admin.context.request;
  const hid = num("SELECT household_id FROM households WHERE head_of_family='Test household'");
  assert.equal((await api.post(base + 'households/members/add_member.php', { data: { household_id: hid, full_name: 'Test household', relationship: 'Head', age: 40, is_child: 0, is_senior: 0, is_pwd: 0, is_pregnant: 0, has_medical_needs: 0, is_other_vulnerable: 0, verify_vulnerability: true } })).status(), 201);
  assert.equal((await api.post(base + 'households/members/verify_roster.php', { data: { household_id: hid, confirm_complete: true } })).status(), 200);
  assert.equal((await api.post(base + 'relief/packages/set_standard.php', { data: { package_id: 95 } })).status(), 200);
  assert.equal((await api.post(base + 'disasters/assign_household_assessment.php', { data: { household_id: hid, assigned_field_officer_id: officerId, version: 0 } })).status(), 200);

  // 1. Field Officer on a phone: classification cards with server points, draft, confirmed submission, locked view.
  const officer = await session('officer@example.test', { width: 390, height: 844 });
  await officer.page.goto(origin + '/field/assignments?household_id=' + hid);
  await officer.page.getByRole('heading', { name: 'Record your household visit' }).waitFor();
  check(await officer.page.getByRole('heading', { name: 'For Assessment', level: 1 }).isVisible(), 'officer page is titled For Assessment');
  await officer.page.getByText('15 pts').waitFor();
  check(await officer.page.getByRole('radio').count() === 5, 'five damage classifications offered');
  await officer.page.getByLabel('Actual visit date (required)').fill(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date()));
  await officer.page.getByRole('radio', { name: /Severely damaged/ }).check();
  await officer.page.getByLabel('Visit findings (required)').fill('Roof partly torn off; family staying with relatives.');
  check(await officer.page.getByText(/Preview total: 60/).isVisible(), 'preview shows subtotal + damage (45 + 15)');
  await officer.page.getByRole('button', { name: 'Save draft' }).click();
  await officer.page.getByText(/Draft saved/).waitFor();
  check(true, 'draft saved');
  await officer.page.screenshot({ path: `${shots}/workflow-officer-form-390.png`, fullPage: true });
  check(await fits(officer.page), 'officer form fits a 390 px phone');
  await officer.page.getByRole('button', { name: 'Submit assessment', exact: true }).click();
  await officer.page.getByRole('dialog').getByText(/will be locked after submission/).waitFor();
  await officer.page.getByRole('button', { name: 'Submit and lock' }).click();
  await officer.page.getByText(/now Ready for Distribution/).waitFor();
  check(await officer.page.getByRole('button', { name: 'Submit assessment' }).count() === 0 && await officer.page.getByText('Locked', { exact: true }).isVisible(), 'submitted visit is locked and read-only');

  // 2. Relief Personnel on a phone: only Ready households; complete with released quantities.
  const personnel = await session('personnel@example.test', { width: 390, height: 844 });
  await personnel.page.goto(origin + '/personnel/assigned');
  const row = personnel.page.locator('.ready-card').filter({ hasText: 'Test household' });
  await row.waitFor();
  check((await row.innerText()).includes('60 / 100') && (await row.innerText()).includes('Moderate Priority'), 'Ready list shows the final score and priority');
  await personnel.page.screenshot({ path: `${shots}/workflow-ready-list-390.png`, fullPage: true });
  check(await fits(personnel.page), 'Ready list fits a 390 px phone');
  await row.getByRole('button', { name: 'Complete distribution' }).click();
  const dialog = personnel.page.getByRole('dialog');
  await dialog.getByLabel(/Rice 5kg/).waitFor();
  check(await dialog.getByLabel(/Rice 5kg/).inputValue() === '2', 'released quantity defaults to the plan');
  await dialog.getByLabel(/Water 1L/).fill('4');
  await dialog.getByLabel('Received by (optional)').fill('Test household');
  await personnel.page.screenshot({ path: `${shots}/workflow-complete-dialog-390.png` });
  await dialog.getByRole('button', { name: 'Confirm and complete' }).click();
  await personnel.page.getByText(/Distribution completed for Test household\. Remaining stock: Rice 5kg 8 sack, Water 1L 36 bottle/).waitFor({ timeout: 10000 })
    .catch(async (e) => { console.log('ALERTS:', JSON.stringify(await personnel.page.locator('.alert').allInnerTexts())); throw e; });
  check(true, 'completion toast shows the remaining stock');
  check(num('SELECT quantity FROM relief_items WHERE item_id=912') === 36, 'stock deducted by the released quantity');
  check(await personnel.page.locator('.ready-card').filter({ hasText: 'Test household' }).count() === 0, 'completed household leaves the Ready list');

  // 3. Administrator on desktop: re-open a Ready household; it disappears from the personnel list.
  sql("INSERT INTO households (head_of_family,purok,address) VALUES ('Second family','Purok 3','Street')");
  const hid2 = num("SELECT household_id FROM households WHERE head_of_family='Second family'");
  sql(`INSERT INTO household_allocations (household_id,round_no,status,ready_score,ready_priority,ready_at,package_id) VALUES (${hid2},1,'READY_FOR_DISTRIBUTION',55,'Moderate Priority',NOW(),95)`);
  const alloc2 = num(`SELECT allocation_id FROM household_allocations WHERE household_id=${hid2}`);
  sql(`INSERT INTO household_allocation_items (allocation_id,item_id,item_name,unit,planned_qty) VALUES (${alloc2},911,'Rice 5kg','sack',2)`);
  sql(`INSERT INTO household_field_assessments (household_id,allocation_id,assigned_field_officer_id,status,damage_classification,findings,locked_at,created_by,updated_by) VALUES (${hid2},${alloc2},${officerId},'assessed','Partially Damaged','Walls cracked',NOW(),${adminId},${adminId})`);
  await admin.page.goto(origin + '/admin/allocations');
  await admin.page.getByRole('heading', { name: 'Standard relief package' }).waitFor();
  check(await admin.page.getByText(/Family pack:.*2 sack Rice 5kg/).waitFor({ timeout: 10000 }).then(() => true, () => false), 'standard package shown with its items');
  await admin.page.getByRole('tab', { name: /^Ready/ }).click();
  const adminRow = admin.page.locator('tbody tr').filter({ hasText: 'Second family' });
  await adminRow.waitFor();
  await admin.page.screenshot({ path: `${shots}/workflow-admin-1440.png`, fullPage: true });
  check(await fits(admin.page), 'admin allocation page fits 1440 px');
  await adminRow.getByRole('button', { name: 'Re-open' }).click();
  await admin.page.getByLabel('Reason (required)').fill('Household size was recorded wrongly.');
  await admin.page.getByRole('dialog').getByRole('button', { name: 'Re-open' }).click();
  await admin.page.getByText(/Allocation re-opened/).waitFor();
  check(true, 'admin re-opens with a reason');
  await personnel.page.goto(origin + '/personnel/assigned');
  await personnel.page.getByRole('heading', { name: 'Ready for Distribution' }).waitFor();
  await personnel.page.getByText(/No households are Ready|Second family/).first().waitFor();
  check(await personnel.page.locator('.ready-card').filter({ hasText: 'Second family' }).count() === 0, 're-opened household is gone from the Ready list');
  await admin.page.setViewportSize({ width: 390, height: 844 });
  await admin.page.goto(origin + '/admin/allocations');
  await admin.page.getByRole('heading', { name: 'Relief Allocation', level: 1 }).waitFor();
  await admin.page.screenshot({ path: `${shots}/workflow-admin-390.png`, fullPage: true });
  check(await fits(admin.page), 'admin allocation page fits a 390 px phone');
  const errors = [...admin.page.errors, ...officer.page.errors, ...personnel.page.errors];
  check(errors.length === 0, 'no browser JavaScript errors: ' + errors.join('; '));
  console.log(`PASS: ${checks} allocation workflow browser checks (${fixture.database})`);
} finally {
  await browser?.close(); php.kill(); vite.kill();
  execFileSync(phpBin, ['-r', "(new PDO('mysql:host=127.0.0.1',getenv('DB_USER')?:'root',getenv('DB_PASS')?:''))->exec('DROP DATABASE `'.$argv[1].'`');", fixture.database]);
}

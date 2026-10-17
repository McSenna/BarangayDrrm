import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/Users/Rivest/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const phpBin = process.env.PHP_BIN || 'C:/xampp/php/php.exe';
const fixture = JSON.parse(execFileSync(phpBin, ['tests/user_management_fixture.php'], { encoding: 'utf8', env: { ...process.env, USER_TEST_FULL_SCHEMA: '1' } }));
const apiBase = 'http://127.0.0.1:8103/backend/';
const origin = 'http://127.0.0.1:5181';
const php = spawn(phpBin, ['-S', '127.0.0.1:8103', '-t', '.'], { env: { ...process.env, DB_HOST: '127.0.0.1', DB_NAME: fixture.database, CORS_ALLOWED_ORIGINS: origin }, stdio: 'ignore' });
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5181', '--strictPort'], { cwd: 'frontend', env: { ...process.env, VITE_API_BASE_URL: apiBase }, stdio: 'ignore' });
let browser; let checks = 0;
const check = (value, name) => { assert.ok(value, name); checks++; console.log(`PASS ${name}`); };
try {
  for (let n = 0; n < 100; n++) { try { await fetch(origin); await fetch(apiBase + 'auth/session.php'); break; } catch { await new Promise((r) => setTimeout(r, 150)); } }
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  assert.equal((await context.request.post(apiBase + 'auth/login.php', { data: { email: 'admin@example.test', password: fixture.password } })).status(), 200);
  const page = await context.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(origin + '/admin/administrators?tab=all');
  await page.locator('.users-pagination').waitFor();
  await page.evaluate(() => { window.originalUsersHeading = document.getElementById('users-title'); });
  for (const [label, tab, heading, row] of [
    ['Household masterlist', 'households', 'Household masterlist', 'Test household'],
    ['Resident masterlist', 'residents', 'Resident masterlist', 'Test Resident'],
    ['Relief Personnel', 'personnel', 'Relief Personnel', 'Test Personnel'],
  ]) {
    await page.getByRole('navigation', { name: 'Users and masterlists' }).getByRole('link', { name: label, exact: true }).click();
    check(new URL(page.url()).pathname === '/admin/administrators', `${label} keeps User Management route`);
    check(new URL(page.url()).searchParams.get('tab') === tab, `${label} selects tab`);
    await page.getByRole('heading', { name: heading, exact: true }).waitFor();
    await page.locator('tbody').getByText(row, { exact: true }).waitFor();
    check(await page.evaluate(() => window.originalUsersHeading === document.getElementById('users-title')), `${label} retains original Users header`);
    check(await page.locator('h1').count() === 1 && await page.locator('.users-summary').count() === 1, `${label} retains one shared page shell`);
    check(await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Users', exact: true }).evaluate((el) => el.classList.contains('active')), `${label} keeps Users active in sidebar`);
  }
  await page.getByRole('button', { name: '+ Add Relief Personnel', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('input[name="full_name"]').fill('Embedded Personnel');
  await dialog.locator('input[name="email"]').fill('embedded@example.test');
  await dialog.locator('input[name="password"]').fill('EmbeddedPassword12');
  await dialog.getByLabel('Assigned Purok', { exact: true }).selectOption('Purok 1');
  await dialog.getByRole('button', { name: 'Add Relief Personnel', exact: true }).click();
  await page.locator('tbody').getByText('Embedded Personnel', { exact: true }).waitFor();
  await page.waitForFunction(() => document.querySelector('.users-stat strong')?.textContent === '6');
  check(true, 'personnel creation works inside tab and refreshes shared counts');
  await page.reload();
  await page.locator('tbody').getByText('Embedded Personnel', { exact: true }).waitFor();
  check(new URL(page.url()).searchParams.get('tab') === 'personnel', 'refresh restores selected tab and persisted data');
  check(await page.locator('tbody tr').filter({ hasText: 'Embedded Personnel' }).getByText('Purok 1', { exact: true }).count() === 1, 'relief assignment persists in account table');
  const reliefContext = await browser.newContext();
  check((await reliefContext.request.post(apiBase + 'auth/login.php', { data: { email: 'embedded@example.test', password: 'EmbeddedPassword12' } })).status() === 200, 'new relief officer can sign in');
  const reliefPage = await reliefContext.newPage();
  reliefPage.on('pageerror', (e) => errors.push(e.message));
  await reliefPage.goto(origin + '/personnel');
  await reliefPage.getByText(/Assigned area: Purok 1/).waitFor();
  check(true, 'relief dashboard displays assigned Purok');
  const scopedHouseholds = await (await reliefContext.request.get(apiBase + 'households/get_households.php')).json();
  check(scopedHouseholds.data.length === 0, 'relief session cannot see fixture household in Purok 3');
  await reliefPage.setViewportSize({ width: 390, height: 900 });
  check(await reliefPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'relief dashboard fits mobile viewport');
  await reliefContext.close();
  await page.getByRole('navigation', { name: 'Users and masterlists' }).getByRole('link', { name: 'Resident masterlist', exact: true }).click();
  await page.getByRole('heading', { name: 'Resident masterlist', exact: true }).waitFor();
  await page.goBack();
  await page.getByRole('heading', { name: 'Relief Personnel', exact: true }).waitFor();
  check(true, 'Back returns to previous tab');
  for (const [legacy, tab] of [['households', 'households'], ['residents', 'residents'], ['personnel', 'personnel']]) {
    await page.goto(origin + '/admin/' + legacy);
    await page.waitForURL(`**/admin/administrators?tab=${tab}`);
    check(true, `${legacy} bookmark redirects into User Management`);
  }
  await page.setViewportSize({ width: 390, height: 900 });
  await page.reload();
  await page.locator('tbody').getByText('Embedded Personnel', { exact: true }).waitFor();
  await page.waitForFunction(() => document.querySelector('.users-stat strong')?.textContent === '6');
  check(await page.locator('.users-tabs [aria-current="page"]').evaluate((el) => {
    const item = el.getBoundingClientRect(); const nav = el.parentElement.getBoundingClientRect();
    return item.left >= nav.left - 1 && item.right <= nav.right + 1;
  }), 'selected tab remains visible on mobile refresh');
  mkdirSync('tests/.user-management-local', { recursive: true });
  await page.screenshot({ path: 'tests/.user-management-local/embedded-personnel-mobile.png', fullPage: true });
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'embedded personnel fits mobile viewport');
  check(errors.length === 0, `no browser errors: ${errors.join('; ')}`);
  console.log(`PASS: ${checks} embedded tab checks (${fixture.database})`);
} finally { await browser?.close(); php.kill(); vite.kill(); }

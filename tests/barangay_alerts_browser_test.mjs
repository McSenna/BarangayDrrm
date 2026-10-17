// Active barangay alerts in the browser, on an isolated fixture database (screenshots in tests/.user-management-local/):
// admin creates + activates alerts on the Barangay Alerts page; an open public Home map picks them up without a
// reload; selected-Purok vs barangay-wide areas; turn off one (others stay, flood zones stay); failed refresh keeps
// the last alerts as "outdated"; failed turn-off keeps the alert active; staff map households stay clickable;
// panning disabled, zoom works; mobile and desktop.
// Usage: node tests/barangay_alerts_browser_test.mjs   (Chrome + Playwright, as tests/allocation_workflow_browser_test.mjs)
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/Users/Rivest/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const phpBin = process.env.PHP_BIN || 'C:/xampp/php/php.exe';
const fixture = JSON.parse(execFileSync(phpBin, ['tests/user_management_fixture.php'], { encoding: 'utf8', env: { ...process.env, USER_TEST_FULL_SCHEMA: '1' } }));
if (!/^codex_users_test_\d{8}_\d{6}_[a-f0-9]+$/.test(fixture.database)) throw new Error('Isolated fixture database required');
const sqlScript = "$p=new PDO('mysql:host=127.0.0.1;dbname='.$argv[1],getenv('DB_USER')?:'root',getenv('DB_PASS')?:'',[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);";
const sql = (q) => execFileSync(phpBin, ['-r', sqlScript + '$p->exec($argv[2]);', fixture.database, q], { encoding: 'utf8' });
sql(readFileSync('database/migration_phase33_barangay_alerts.sql', 'utf8'));
const origin = 'http://127.0.0.1:5191', base = 'http://127.0.0.1:8127/backend/';
const php = spawn(phpBin, ['-S', '127.0.0.1:8127', '-t', '.', 'backend/dev_router.php'], { env: { ...process.env, DB_HOST: '127.0.0.1', DB_NAME: fixture.database, CORS_ALLOWED_ORIGINS: origin }, stdio: 'ignore' });
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5191', '--strictPort'], { cwd: 'frontend', env: { ...process.env, VITE_API_BASE_URL: base, VITE_ALERT_POLL_MS: '5000' }, stdio: 'ignore' });
const shots = 'tests/.user-management-local';
let browser, checks = 0;
const check = (ok, label) => { assert.ok(ok, label); checks++; console.log('PASS ' + label); };
const fits = (page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
const paths = (page, pane) => page.locator(`.leaflet-${pane}-pane path`).count();
async function context(viewport, email) {
  const ctx = await browser.newContext({ viewport });
  if (email) assert.equal((await ctx.request.post(base + 'auth/login.php', { data: { email, password: fixture.password } })).status(), 200, 'login ' + email);
  const page = await ctx.newPage(); page.errors = []; page.on('pageerror', (e) => page.errors.push(e.message));
  return { ctx, page };
}
// A point well inside Purok 3 (mean of its vertices) for the fixture household.
const purok3 = JSON.parse(readFileSync('frontend/src/data/binitayan_purok_boundaries_candidate.geojson', 'utf8')).features.find((f) => f.properties.name === 'Purok 3').geometry.coordinates[0].slice(0, -1);
const [lng, lat] = purok3.reduce(([a, b], [x, y]) => [a + x / purok3.length, b + y / purok3.length], [0, 0]);
try {
  for (let n = 0; n < 160; n++) { try { await fetch(origin); await fetch(base + 'auth/session.php'); break; } catch { await new Promise((r) => setTimeout(r, 150)); } }
  mkdirSync(shots, { recursive: true });
  sql(`UPDATE households SET latitude=${lat.toFixed(7)}, longitude=${lng.toFixed(7)} WHERE purok='Purok 3'`);
  browser = await chromium.launch({ channel: 'chrome', headless: true });

  // ---- public Home map, opened BEFORE any alert exists and never reloaded
  const pub = await context({ width: 1440, height: 900 });
  await pub.page.goto(origin + '/');
  const panel = pub.page.locator('.lp-alerts');
  await panel.getByText('No active barangay alerts.').waitFor();
  check(!(await panel.textContent()).match(/\bsafe\b(?! —)/i) || (await panel.textContent()).includes('does not mean an area is safe'), 'empty state is neutral, not "safe"');
  const card = pub.page.locator('.alert-card');
  await card.waitFor();
  check(!(await card.textContent()).match(/Normal|All clear/) && await card.getByText('No alert in effect').isVisible(), 'Live Situation card: neutral when no alert (no "Normal", no "All clear")');
  await pub.page.locator('.leaflet-lm-zones-pane path').first().waitFor();
  check(await paths(pub.page, 'lm-zones') === 8, 'all eight Purok areas drawn');
  check(await paths(pub.page, 'lm-excluded') >= 1, 'cemetery exclusion outline drawn');
  check(await paths(pub.page, 'lm-alerts') === 0, 'no alert overlay while none is active');
  check(await pub.page.locator('.lm .leaflet-grab, .lm .leaflet-touch-drag').count() === 0, 'Home map panning disabled');
  check(await pub.page.locator('.lm .leaflet-control-zoom-out.leaflet-disabled').count() === 1, 'zoomed fully out to the whole barangay');
  await pub.page.locator('.lm .leaflet-control-zoom-in').click();
  const zoomedOut = (yes) => pub.page.waitForFunction((y) => document.querySelector('.lm .leaflet-control-zoom-out').classList.contains('leaflet-disabled') === y, yes, { timeout: 5000 }).then(() => true, () => false);
  check(await zoomedOut(false), 'zoom in works');
  await pub.page.locator('.lm .leaflet-control-zoom-out').click();
  check(await zoomedOut(true), 'zooming back out returns to the whole barangay');
  check(await pub.page.locator('.lm-legend').getByText('Designated flood-prone Purok (permanent)').isVisible() && await pub.page.locator('.lm-legend').getByText('Active alert area — Critical').isVisible(), 'legend separates permanent flood zones from alert areas');

  // ---- administrator: create a selected-Puroks alert as a draft and activate it in the UI
  const admin = await context({ width: 1440, height: 900 }, 'admin@example.test');
  await admin.page.goto(origin + '/admin/hazard-alerts');
  await admin.page.getByRole('button', { name: 'New alert' }).click();
  const form = admin.page.getByRole('dialog');
  await form.getByLabel('Alert title').fill('Rising water along the river');
  await form.getByText('Critical', { exact: true }).click();
  await form.getByText('Selected puroks').click();
  await form.getByRole('button', { name: 'Save as draft' }).click();
  check(await form.getByText('Select at least one purok').isVisible(), 'selected puroks need at least one purok');
  await form.getByLabel('Purok 1', { exact: true }).check();
  await form.getByLabel('Purok 3', { exact: true }).check();
  await form.getByLabel(/Resident instructions/).fill('Move to higher ground now.');
  await form.getByRole('button', { name: 'Save as draft' }).click();
  await admin.page.getByText('Alert saved as a draft').waitFor();
  check(await admin.page.getByRole('tab', { name: /Drafts/ }).getAttribute('aria-selected') === 'true', 'draft listed under Drafts');
  await admin.page.waitForTimeout(6000);
  check(await paths(pub.page, 'lm-alerts') === 0, 'a draft never reaches the public map');
  await admin.page.getByRole('button', { name: 'Activate Rising water along the river' }).click();
  await admin.page.getByRole('dialog').getByRole('button', { name: 'Activate alert' }).click();
  await admin.page.getByText('Alert activated').waitFor();
  await admin.page.screenshot({ path: `${shots}/alerts_admin_list.png` });
  check(await admin.page.locator('td').getByText('Active', { exact: true }).count() === 1, 'listed as Active after the server saved it');

  // A second, barangay-wide Advisory (through the API, as the same administrator).
  const api = admin.ctx.request;
  const wide = (await (await api.post(base + 'hazards/alerts/save_alert.php', { data: { title: 'Typhoon signal no. 1', hazard_type: 'Typhoon', severity: 'Advisory', scope: 'barangay', puroks: [], instructions: 'Secure loose items.' } })).json()).alert;
  assert.equal((await api.post(base + 'hazards/alerts/activate.php', { data: { alert_id: wide.alert_id } })).status(), 200);

  // ---- the open public map updates without a reload
  await panel.getByText('Typhoon signal no. 1').waitFor({ timeout: 15000 });
  await panel.getByText('Rising water along the river').waitFor();
  check(await paths(pub.page, 'lm-alerts') === 6, 'overlays: Purok 1 + Purok 3 + barangay boundary (casing + outline each)');
  check(await card.getByText('Alert level: Critical').waitFor({ timeout: 8000 }).then(() => true, () => false), 'Live Situation card follows the alert panel (no 60 s lag)');
  check(await panel.getByText('Move to higher ground now.').isVisible() && await panel.locator('.aa-item-meta').getByText('Purok 1, Purok 3').isVisible() && await panel.locator('.aa-item-meta').getByText('Entire barangay').isVisible(), 'residents see instructions and affected areas');
  check((await panel.locator('.aa-highest').textContent()).includes('Critical') && (await panel.locator('.aa-item').first().textContent()).includes('Rising water'), 'highest severity first; lower one still listed');
  check(/Active since .*(AM|PM)/.test(await panel.locator('.aa-item').first().textContent()), 'activation time shown');
  await panel.getByRole('button', { name: /Rising water along the river/ }).click();
  check(await panel.getByText(/Highlighted on the map: Purok 1, Purok 3\. The outline shows the whole affected area, not an exact incident location/).isVisible(), 'selecting an alert shows details without implying an exact location');
  await pub.page.screenshot({ path: `${shots}/alerts_home_desktop_active.png`, fullPage: false });

  // ---- staff Barangay Map: alert layer, households still clickable
  await admin.page.goto(origin + '/admin/map');
  await admin.page.locator('.gis-alerts').getByText('Rising water along the river').waitFor();
  await admin.page.locator('.leaflet-gis-alerts-pane path').first().waitFor();
  check(await paths(admin.page, 'gis-alerts') === 6, 'staff map draws the same alert areas');
  check(await admin.page.locator('.gis-frame .leaflet-grab').count() === 0, 'staff map panning still disabled');
  // The marker wrapper is zero-sized by design; the visible tile is its .gis-house child.
  const marker = admin.page.locator('.leaflet-marker-pane .leaflet-marker-icon[title^="Household"] .gis-house').first();
  await marker.click();
  check(await admin.page.locator('.leaflet-popup').count() === 1, 'household marker inside an alert Purok is still clickable');
  // Clicks on the map still reach the Purok areas under the (non-interactive) alert layer.
  const hit = await admin.page.evaluate(() => [...document.querySelectorAll('.leaflet-gis-labels-pane .leaflet-marker-icon')].map((m) => {
    const r = m.firstElementChild.getBoundingClientRect();
    const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return el?.closest('.leaflet-pane')?.className || el?.tagName;
  }));
  // (A household marker or its open popup may sit on a label point; those are above the areas by design.)
  check(hit.length === 8 && hit.every((c) => /gis-zones-pane|marker-pane|popup-pane/.test(c)) && hit.filter((c) => /gis-zones-pane/.test(c)).length >= 6,
    'the alert layer never intercepts clicks; Purok areas below stay clickable: ' + JSON.stringify(hit));
  await admin.page.locator('.gis-alerts').getByRole('button', { name: /Rising water along the river/ }).click();
  check(await admin.page.locator('.gis-alerts .aa-item.is-selected').count() === 1, 'staff can select an alert');
  await admin.page.screenshot({ path: `${shots}/alerts_staff_map.png` });

  // ---- turning off fails (network): the alert stays active and the reason is shown
  await admin.page.goto(origin + '/admin/hazard-alerts');
  await admin.page.route('**/hazards/alerts/deactivate.php', (r) => r.abort());
  await admin.page.getByRole('button', { name: 'Turn off Rising water along the river' }).click();
  const off = admin.page.getByRole('dialog');
  await admin.page.screenshot({ path: `${shots}/alerts_admin_turn_off_dialog.png` });
  check(await off.getByText('Turn off this alert? It will no longer appear as an active alert on the barangay map.').isVisible() && (await off.textContent()).includes('Rising water along the river'), 'confirmation shows the exact copy and the title');
  await off.getByRole('button', { name: 'Turn off alert' }).click();
  await off.getByText(/The alert is still active/).waitFor();
  check(await off.isVisible() && await admin.page.locator('td').getByText('Active', { exact: true }).count() === 2, 'failed turn-off keeps the alert active');
  await admin.page.unroute('**/hazards/alerts/deactivate.php');

  // ---- turn off for real, with a note
  await off.getByLabel('Resolution note (optional)').fill('Water receded.');
  await off.getByRole('button', { name: 'Turn off alert' }).click();
  await admin.page.getByText('Alert turned off.').waitFor();
  await panel.getByText('Rising water along the river').waitFor({ state: 'detached', timeout: 15000 });
  check(await panel.getByText('Typhoon signal no. 1').isVisible(), 'turning off one alert leaves the other visible');
  check(await paths(pub.page, 'lm-alerts') === 2 && await paths(pub.page, 'lm-zones') === 8 && await paths(pub.page, 'lm-excluded') >= 1, 'only its overlay removed; flood zones and cemetery exclusion remain');

  // ---- history kept
  await admin.page.getByRole('tab', { name: /Inactive/ }).click();
  await admin.page.getByRole('button', { name: 'History of Rising water along the river' }).click();
  const hist = admin.page.getByRole('dialog');
  await hist.locator('.ba-history-what').getByText('Turned off', { exact: true }).waitFor();
  await admin.page.screenshot({ path: `${shots}/alerts_admin_history.png` });
  check((await hist.textContent()).includes('Water receded.') && (await hist.textContent()).includes('Activated') && (await hist.textContent()).includes('Created as a draft'), 'history: created, activated, turned off with note');
  await hist.getByRole('button', { name: 'Close' }).first().click();

  // ---- a request that hangs counts as a failure (time-out), so the panel says "may be outdated"
  await pub.page.route('**/get_active_alerts.php', () => { /* never answered */ });
  await panel.getByText(/Alert information may be outdated/).waitFor({ timeout: 25000 });
  check(await panel.getByText('Typhoon signal no. 1').isVisible(), 'hung refresh times out: last alerts kept, marked outdated');
  await pub.page.unroute('**/get_active_alerts.php');
  await panel.getByText(/may be outdated/).waitFor({ state: 'detached', timeout: 25000 });

  // ---- refresh failure keeps the last alerts and says they may be outdated
  await pub.page.route('**/get_active_alerts.php', (r) => r.abort());
  await panel.getByText(/Alert information may be outdated\. Last successful update/).waitFor({ timeout: 15000 });
  check(await panel.getByText('Typhoon signal no. 1').isVisible() && await panel.getByText('No active barangay alerts.').count() === 0, 'failed refresh keeps the last alerts (never "no alerts")');
  await pub.page.unroute('**/get_active_alerts.php');
  await panel.getByText(/may be outdated/).waitFor({ state: 'detached', timeout: 15000 });
  check(true, 'recovers after the next successful refresh');

  // ---- mobile
  const mobile = await context({ width: 390, height: 844 });
  await mobile.page.goto(origin + '/');
  await mobile.page.locator('.lp-alerts').getByText('Typhoon signal no. 1').waitFor();
  await mobile.page.locator('#hazard-map .lm-card').scrollIntoViewIfNeeded();
  await mobile.page.locator('.leaflet-lm-alerts-pane path').first().waitFor();
  check(await fits(mobile.page), 'mobile Home page has no horizontal overflow');
  await mobile.page.screenshot({ path: `${shots}/alerts_home_mobile_map.png` });
  const btn = await mobile.page.locator('.lp-alerts .aa-item-btn').first().boundingBox();
  check(btn.height >= 44, 'alert rows are at least 44px tall on mobile');
  await mobile.page.locator('.lp-alerts').screenshot({ path: `${shots}/alerts_home_mobile_panel.png` });
  check(await fits(pub.page), 'desktop Home page has no horizontal overflow');

  for (const p of [pub.page, admin.page, mobile.page]) check(p.errors.length === 0, 'no page errors ' + p.errors.join(' | '));
  console.log(`ALL ${checks} CHECKS PASSED`);
} catch (error) {
  console.error(error.stack || error.message);
  process.exitCode = 1;
} finally {
  await browser?.close();
  php.kill(); vite.kill();
  execFileSync(phpBin, ['-r', `(new PDO('mysql:host=127.0.0.1', 'root', ''))->exec('DROP DATABASE IF EXISTS \`${fixture.database}\`');`]);
}

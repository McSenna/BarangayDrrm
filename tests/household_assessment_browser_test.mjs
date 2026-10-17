import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/Users/Rivest/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin = 'http://127.0.0.1:5194';
const base = 'http://127.0.0.1:8194/backend/';
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5194', '--strictPort'], { cwd: 'frontend', env: { ...process.env, VITE_API_BASE_URL: base }, stdio: 'ignore' });
let browser;
let rows = [{ household_id: 41, head_of_family: 'Visit Test Household', purok: 'Purok 1', address: 'Test Street', status: 'pending_assignment', version: 0 }, { household_id: 42, head_of_family: 'Another Officer Household', purok: 'Purok 1', status: 'assigned', assigned_field_officer_id: 88, version: 1 }];
const requests = [];
const errors = [];
let photoUploads = 0;
async function contextFor(role, user_id, viewport = { width: 1440, height: 1000 }) {
  const context = await browser.newContext({ viewport });
  await context.route(base + '**', async (route) => {
    const request = route.request(); const path = new URL(request.url()).pathname;
    let data = { success: true, data: {} }; let status = 200;
    if (path.endsWith('/auth/session.php')) data = { authenticated: true, user: { user_id, role, full_name: 'Test User', assigned_purok: 'Purok 1' } };
    else if (path.endsWith('/list_household_assessments.php')) data.data = rows;
    else if (path.endsWith('/get_users.php')) data.data = [{ user_id: 7, full_name: 'Active Officer', role: 'field_officer', is_active: 1, assigned_purok: 'Purok 1' }, { user_id: 9, full_name: 'Inactive Officer', role: 'field_officer', is_active: 0 }];
    else if (path.endsWith('/assign_household_assessment.php')) {
      const payload = request.postDataJSON(); requests.push({ type: 'assign', payload });
      rows[0] = { ...rows[0], ...payload, assigned_field_officer_name: 'Active Officer', status: 'assigned', version: 1 };
      const { head_of_family, purok, address, assigned_field_officer_name, ...record } = rows[0]; data.data = record;
    } else if (path.endsWith('/submit_household_assessment.php')) {
      const payload = request.postDataJSON(); requests.push({ type: 'submit', payload });
      rows[0] = { ...rows[0], ...payload, status: 'assessed', version: 2, submitted_at: '2026-10-17 12:00:00' };
      const { head_of_family, purok, address, assigned_field_officer_name, ...record } = rows[0]; data.data = record;
    } else if (path.endsWith('/household_assessment_photos.php')) {
      if (request.method() === 'POST') { requests.push({ type: 'photo' }); photoUploads++; }
      data.data = [];
      if (request.method() === 'POST' && photoUploads === 1) { status = 400; data = { success: false, message: 'Photo upload interrupted. Retry this evidence.' }; }
    } else if (path.endsWith('/get_reports.php')) data.data = [{ report_id: 11, household_id: 41, head_of_family: 'Visit Test Household', disaster_type: 'Flood', severity: 'Low', report_date: '2026-10-16', status: 'Verified' }];
    else if (path.endsWith('/get_damage_assessment.php')) data.data = { house_damage: 'Major', remarks: 'Legacy damage finding' };
    else if (path.endsWith('/get_report_photos.php')) data.data = [{ photo_id: 1, file_path: 'legacy.jpg' }];
    else if (path.endsWith('/get_households.php')) data.data = rows;
    else if (path.endsWith('/get_types.php')) data.data = [];
    else if (path.endsWith('/get_notifications.php')) data.data = [];
    else if (path.endsWith('/hazard_status.php')) data.data = { active_alerts: [] };
    await route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': origin, 'access-control-allow-credentials': 'true', 'access-control-allow-headers': 'content-type' }, body: JSON.stringify(data) });
  });
  const page = await context.newPage(); page.on('pageerror', (err) => errors.push(err.message));
  return { context, page };
}
try {
  for (let n = 0; n < 100; n++) { try { await fetch(origin); break; } catch { await new Promise((resolve) => setTimeout(resolve, 150)); } }
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const { page: admin } = await contextFor('admin', 1);
  await admin.goto(origin + '/admin/field-assessments');
  await admin.getByRole('button', { name: 'Review Visit Test Household' }).click();
  assert.equal(await admin.getByText('Not Yet Assessed', { exact: true }).count() >= 1, true);
  assert.equal(await admin.getByRole('button', { name: 'Complete assessment' }).count(), 0);
  assert.equal(await admin.getByRole('option', { name: 'Inactive Officer' }).count(), 0);
  await admin.getByLabel('Active Field Officer').selectOption('7');
  await admin.getByRole('button', { name: 'Assign visit', exact: true }).click();
  await admin.getByRole('status').filter({ hasText: 'Field Officer assigned' }).waitFor();
  assert.equal(requests[0].payload.version, 0);
  console.log('PASS admin assigns active officer, cannot edit visit findings');
  mkdirSync('tests/.user-management-local', { recursive: true });
  await admin.screenshot({ path: 'tests/.user-management-local/assessment-admin-desktop.png', fullPage: true });
  const { page: field } = await contextFor('field_officer', 7, { width: 390, height: 844 });
  await field.goto(origin + '/field/assignments');
  await field.getByRole('button', { name: 'Review Visit Test Household' }).click();
  assert.equal(await field.getByText('Another Officer Household', { exact: true }).count(), 0);
  assert.equal(await field.getByLabel('Actual visit date (required)').inputValue(), '');
  assert.equal(await field.getByLabel('House damage (required)').inputValue(), '');
  assert.equal(await field.locator('form').evaluate((form) => form.checkValidity()), false);
  await field.getByLabel('Actual visit date (required)').fill('2026-10-16');
  await field.getByLabel('House damage (required)').selectOption('None');
  await field.getByLabel('Visit findings (required)').fill('Visited the home. Roof and walls intact; no damage observed.');
  await field.getByRole('button', { name: 'Complete assessment', exact: true }).click();
  await field.getByRole('status').filter({ hasText: 'Assessment completed and saved' }).waitFor();
  assert.equal(await field.getByText('No Damage — Assessed', { exact: true }).count() >= 1, true);
  assert.equal(requests.find((entry) => entry.type === 'submit').payload.field_visit_date, '2026-10-16');
  assert.equal(requests.find((entry) => entry.type === 'submit').payload.remarks, '');
  await field.getByLabel('Add available photo evidence').setInputFiles({ name: 'visit.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aU44AAAAASUVORK5CYII=', 'base64') });
  await field.getByRole('button', { name: 'Upload 1 photo', exact: true }).click();
  await field.getByText('Photo upload interrupted. Retry this evidence.', { exact: false }).waitFor();
  assert.equal(await field.getByText('No Damage — Assessed', { exact: true }).count() >= 1, true);
  await field.getByRole('button', { name: 'Upload 1 photo', exact: true }).click();
  await field.getByRole('status').filter({ hasText: 'Photo evidence uploaded' }).waitFor();
  assert.equal(photoUploads, 2);
  assert.equal(await field.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await field.evaluate(() => window.scrollTo(0, 0));
  await field.screenshot({ path: 'tests/.user-management-local/assessment-field-mobile.png', fullPage: true });
  console.log('PASS assigned officer records actual visit, required findings, no damage, retained assessment after photo failure/retry and mobile fit');
  const { page: relief } = await contextFor('relief_personnel', 20);
  await relief.goto(origin + '/personnel/field-assessments?household_id=41');
  await relief.getByRole('heading', { name: 'Visit Test Household' }).waitFor();
  assert.equal(await relief.getByLabel('Visit findings (required)').count(), 0);
  assert.equal(await relief.getByLabel('Active Field Officer').count(), 0);
  assert.equal(await relief.getByLabel('Add available photo evidence').count(), 0);
  await admin.goto(origin + '/admin/reports');
  await admin.getByRole('button', { name: 'View', exact: true }).click();
  await admin.getByText('Earlier report assessment (reference)').waitFor();
  assert.equal(await admin.getByRole('button', { name: 'Save Damage Assessment' }).count(), 0);
  assert.equal(await admin.getByText('Legacy damage finding', { exact: true }).count(), 1);
  assert.equal(await admin.getByRole('img', { name: 'Disaster report' }).count(), 1);
  assert.equal(errors.length, 0, errors.join('; '));
  console.log('PASS relief read-only and legacy damage/evidence retained without old edit action; no page errors');
} finally { if (browser) await browser.close(); vite.kill(); }

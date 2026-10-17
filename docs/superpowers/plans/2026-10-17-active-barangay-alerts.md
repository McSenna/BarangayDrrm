# Active Barangay Alerts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Administrators create, edit, activate and turn off barangay alerts (Draft → Active → Inactive). Active alerts appear on the public Home map and the staff Barangay Map without a page reload, and every record and its history is kept.

**Architecture:** Extend the existing `hazard_alerts` table instead of adding a second alert system, because it already drives the header chip, the DRRM phase, the dashboard and the public status. All writes go through one service library, `backend/lib/barangay_alerts.php`; endpoints are thin. `alert_status` is the lifecycle, and `is_active` stays as a mirror enforced by a CHECK constraint, so existing readers keep working. Multi-Purok scope lives in `hazard_alert_puroks`, and the audit trail lives in `hazard_alert_history`, where a unique key stops repeated activation or deactivation entries. On the frontend, one polling hook (`useActiveAlerts`, 15 s by default) feeds one shared panel and one shared Leaflet layer, and both maps use them.

**Tech Stack:** PHP 8.2 + PDO + MariaDB 10.4 (XAMPP); React 18 + Vite + react-leaflet 4 + lucide-react.

**Spec:** the user request "Active Barangay Alert System on the existing barangay map" (session of 2026-10-17), sections 1–9.

## Global Constraints

- Severities: exactly `Advisory`, `Warning`, `Critical`. Colours: Advisory yellow/amber, Warning orange, Critical red, each with a label and an icon.
- Lifecycle: `Draft`, `Active`, `Inactive`. Inactive is final, and records are never deleted once activated.
- Puroks: exactly `Purok 1, 2, 3, 4, 5A, 5B, 6, 7` (`BINITAYAN_PUROKS`). Anything else is rejected.
- Turn-off copy (verbatim): "Turn off this alert? It will no longer appear as an active alert on the barangay map."
- Empty copy (verbatim): "No active barangay alerts." It never says or implies "safe" or "all clear".
- Times are stored as TIMESTAMP in the DB session zone (+08:00), returned as ISO 8601 with offset, and shown in `Asia/Manila`.
- No SMS, email or push is sent as a side effect of activation. Nothing is turned off automatically.
- Flood-prone Puroks 1–4, the cemetery cut-out, Purok boundaries and labels are unchanged and stay in their own pane. Alert overlays use a separate pane and are non-interactive, so labels and household markers stay on top and clickable.
- No hex outside `tokens.css` / `mapTokens.js` (DESIGN.md rule).

## Review Focus

1. Two admins act at once (edit vs turn-off, double-click on Turn off): this must give one history row and a 409 on a stale edit. Tested in Task 1 (`version` mismatch → 409; second deactivate → `already` with no new row).
2. Legacy rows and legacy inserts (seed scripts insert `is_active` only; old `affected_purok` values such as "7"): these must read correctly. Tested in Task 1 (legacy insert gets `Active`; "7" is read as `Purok 7`).
3. Network drops while the map is open: the last alerts must stay visible with an "outdated" notice and must never show "No active barangay alerts". Tested in Task 3 (`reduceAlertsState` on failure).
4. Draft leakage: a draft must never reach the public endpoint or non-admin staff. Tested in Task 2 (public list excludes drafts; personnel `get_alerts` excludes drafts).
5. Advisory severity was unknown to the header chip and badges, which would have shown "Normal" while an Advisory was active. Covered in Task 4 (chip/mapper map Advisory → warning) and in the landing adapter test.

---

### Task 1: Schema migration + alert service library

**Files:**
- Create: `database/migration_phase33_barangay_alerts.sql`, `database/apply_barangay_alerts_migration.php`, `backend/lib/barangay_alerts.php`
- Test: `tests/barangay_alerts_test.php` (isolated fixture DB via `tests/user_management_fixture.php`)

**Interfaces — Produces:**
- `class BarangayAlertError extends RuntimeException` (code = HTTP status)
- `ba_validate_input(array $data, bool $is_edit): array` → clean `{title, hazard_type, severity, description, instructions, scope, puroks[]}`. Throws 400 on unknown keys, status fields, bad type, severity, scope or Purok, an empty Purok list for `puroks` scope, or a Purok list with `barangay` scope.
- `ba_create(PDO, array $data, int $actor): int`, which creates a draft.
- `ba_update(PDO, int $id, array $data, int $actor): array`, which needs `version`. Allowed for Draft or Active only.
- `ba_activate(PDO, int $id, int $actor): array{alert, already}`
- `ba_deactivate(PDO, int $id, int $actor, ?string $note): array{alert, already}`
- `ba_delete_draft(PDO, int $id, int $actor): void`
- `ba_get(PDO, int $id): ?array`, `ba_list(PDO, array $filters, bool $include_drafts): array`, `ba_history(PDO, int $id): array`, `ba_public_active(PDO): array`
- `ba_iso(?string $ts): ?string`
- Constants: `BA_TYPES = ['Flood','Typhoon','Fire','Landslide','Earthquake','Other']`, `BA_SEVERITIES`, `BA_SEVERITY_RANK = ['Critical'=>4,'Warning'=>3,'Advisory'=>2,'Alert'=>2,'Normal'=>1]`

Migration (repeatable): widen enums (`hazard_type` + Fire, Earthquake, Other; `status` + Advisory, keeping legacy values), `affected_purok` VARCHAR(120); add `alert_status` (default `IF(is_active=1,'Active','Inactive')`), `scope` (default from `affected_purok`), `instructions`, `resolution_note`, `created_by/at`, `updated_by/at`, `version`; CHECK `(alert_status='Active') = (is_active=1)`. Create `hazard_alert_puroks` (PK alert_id+purok, CHECK in the list, FK cascade) and `hazard_alert_history` (action ENUM created/updated/activated/deactivated, `once_key` persistent + UNIQUE for activated and deactivated). Backfill Puroks from standard `affected_purok` values, and history from `issued_*`/`resolved_*` with `INSERT IGNORE`.

- [ ] Write the test, covering: create → Draft with `issued_at` NULL; validation rejects `Purok 8`, `Purok 5`, `0`, `[]` with puroks scope, `alert_status` in the payload, and an unknown type or severity; Draft→Active writes 1 `activated` row; Active→Inactive saves the note and writes 1 row; a 2nd deactivate gives `already=true` and still 1 row; Inactive→activate 409; Draft→deactivate 409; editing Inactive 409; stale `version` 409; edit of Active records `updated` with the changed fields; `ba_public_active` lists only Active rows, with no actor names or notes; a legacy `INSERT (is_active=1, affected_purok='7')` reads as Active with puroks `['Purok 7']`; deleting a non-draft 409; running the migration twice changes nothing.
- [ ] Run `C:/xampp/php/php.exe tests/barangay_alerts_test.php` and confirm it fails because the lib is missing.
- [ ] Implement the migration and the lib. Each transition runs in a transaction with `SELECT … FOR UPDATE`, and only the status columns and actor columns are written. Each successful change calls `log_action`.
- [ ] Run the test again and confirm `ALL n CHECKS PASSED`. Apply it to the local DB with `php database/apply_barangay_alerts_migration.php`.
- [ ] Commit.

### Task 2: Endpoints

**Files:**
- Create: `backend/hazards/alerts/save_alert.php` (POST create, PUT edit), `activate.php`, `deactivate.php`, `get_alert_history.php`, `get_active_alerts.php` (public, `Cache-Control: no-store`)
- Modify: `add_alert.php` (delegates to the lib, as create followed by activate for old clients), `update_status.php` (`resolve` → `ba_deactivate`; level change → `ba_update`), `delete_alert.php` (drafts only), `get_alerts.php` (lib, `state` filter, drafts admin-only), `backend/hazards/get_public_status.php` (lib, Advisory rank, legacy keys kept), `backend/dashboard/overview.php` (Purok filter also matches `hazard_alert_puroks`), `backend/maintenance/get_purok_values.php` and `apply_purok_mapping.php` (legacy rows only), `backend/setup_demo_data.php`
- Test: `tests/barangay_alerts_integration_test.mjs` (php -S on the fixture DB, as in `user_management_integration_test.mjs`)

**Interfaces — Consumes:** the Task 1 lib. **Produces:** JSON `{success, data}`. The public alert shape is `{alert_id, title, hazard_type, severity, description, instructions, scope, puroks[], unmapped_area, activated_at, updated_at}`, plus `highest_severity` and `server_time`.

- [ ] Write the test, covering: anonymous, resident and personnel get 401/403 on save, activate, deactivate, history and delete; anonymous gets 200 on `get_active_alerts`; admin creates two alerts (barangay-wide and Puroks 1+3) and activates both, and the public endpoint returns both with the correct `puroks`; turning off one leaves the other in the public list; a repeated turn-off returns 200 `already` with 1 history row; deactivate with an extra `title` key returns 400; a non-admin `get_alerts` has no drafts; `get_public_status` `overall_status` follows the highest severity.
- [ ] Run it and confirm it fails (404s).
- [ ] Implement the endpoints. Each requires `cors.php` and `require_login(['admin'])` for writes and accepts only POST/PUT, and errors are mapped from `BarangayAlertError`.
- [ ] Run it and confirm it passes. Then run `php -l` on the changed files.
- [ ] Commit.

### Task 3: Frontend data layer

**Files:**
- Create: `frontend/src/features/alerts/alertModel.js` (pure), `frontend/src/features/alerts/useActiveAlerts.js`
- Modify: `frontend/src/services/api.jsx` (new calls)
- Test: `tests/barangay_alerts_model_test.mjs`

**Produces:**
- `SEVERITY_META[sev] = {label, tone, rank}`
- `normalizeAlert(raw)`
- `highestSeverity(alerts)`
- `areaLabel(alert)`
- `formatManila(iso)`
- `alertAreas(alerts, purokNames) → {barangay: sev|null, puroks: Map<name, {severity, ids}>, missing: string[]}`
- `reduceAlertsState(state, {type:'success'|'failure', alerts, at})` (on failure, keeps the alerts and sets `outdated`)
- `ALERTS_CHANGED_CHANNEL = "barangay-alerts"`, `announceAlertsChanged()`
- `useActiveAlerts({interval = Number(import.meta.env.VITE_ALERT_POLL_MS) || 15000}) → {alerts, status:'loading'|'ready'|'error', outdated, lastSuccessAt, refresh}`. It polls with one request in flight, an AbortController, a refresh when the tab becomes visible, and a BroadcastChannel refresh, and it cleans everything up on unmount.

- [ ] Write the test, covering: the failure reducer keeps the previous alerts and never returns an empty "ready" list; the first failure with no data gives `status 'error'`; highest severity is Critical over Warning over Advisory, with legacy Alert treated as Advisory; `alertAreas` takes the highest severity per Purok and lists unknown Puroks in `missing`; `formatManila("2026-10-17T15:40:00+08:00")` contains "3:40"; the area label reads "Purok 1, Purok 3" or "Entire barangay".
- [ ] Run it and confirm it fails. Implement. Run it and confirm it passes.
- [ ] Commit.

### Task 4: Shared alert UI + both maps

**Files:**
- Create: `frontend/src/features/alerts/ActiveAlertsPanel.jsx`, `AlertAreaLayer.jsx`, `AlertLegend.jsx`, `alerts.css`
- Modify: `frontend/src/styles/tokens.css`, `frontend/src/theme/mapTokens.js` (severity hues), `features/landing/MapPanel.jsx`, `features/landing/BarangayMap.jsx` (alert pane 440 replaces the incident pins; zoom buttons, pinch and double-click in centre mode, minimum zoom = whole barangay, still no dragging), `features/landing/mappers.js` + `AlertCard.jsx` (Advisory; multi-Purok; replace "All clear"), `components/BarangayMapView.jsx` + `gis/GisMap.jsx` (alert layer, `focus.type === 'bounds'`, households in alert Puroks), `gis/GisChrome.jsx` legend, `components/shell/HazardStatusChip.jsx`, `utils/hazardSummary.js`, `components/ui/StatusBadge.jsx` (Advisory), `context/ShellStatusContext.jsx` (refresh on the channel)
- Test: extend `tests/landing_adapter_test.mjs` (Advisory → warning; multi-Purok label; no "All clear" text)

- [ ] Extend the adapter test and confirm it fails. Implement. Run the adapter, model and Purok JS tests and confirm they pass. Run `npm run build` and confirm it succeeds.
- [ ] Browser check at 1280 and 390 px: the panel, selection emphasis, the legend, households still clickable, no dragging, zoom working, the cemetery cut-out visible.
- [ ] Commit.

### Task 5: Admin alert management page

**Files:**
- Modify: `frontend/src/pages/admin/HazardAlerts.jsx` (rewrite), `components/shell/navConfig.js` (label "Barangay Alerts")
- Create: `frontend/src/pages/admin/alerts/AlertForm.jsx`, `AlertDialogs.jsx`

The page has tabs Active / Drafts / Inactive history / All with counts. Draft rows offer Edit, Activate and Delete draft; Active rows offer Edit, Turn off and Send SMS (the existing explicit link); Inactive rows offer View history. The turn-off dialog shows the title, the verbatim copy and an optional note (≤ 500). It waits for the server, keeps the alert active and shows the server message on failure, and on success refreshes and calls `announceAlertsChanged()`.

- [ ] Run `npm run build`. Browser check: create → activate → it appears on the Home map within 15 s, or immediately in a second tab. Turn off with a note → it is gone from the map, the history shows both events, and the flood zones remain.
- [ ] Commit.

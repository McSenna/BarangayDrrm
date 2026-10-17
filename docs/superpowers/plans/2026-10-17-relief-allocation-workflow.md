# Relief Allocation Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 100-point household scoring with field-officer damage, automatic Ready for Distribution after a complete visit, Ready-only Relief Personnel distribution with all-or-nothing locked stock deduction, replacing the old approval paths.

**Architecture:** PHP 8 native endpoints + MariaDB 10.4 + React (Vite). One scoring service (`backend/lib/automatic_priority.php`), one allocation state machine (`backend/lib/allocation_workflow.php`, the only writer of `household_allocations.status`), field assessments made per allocation round (`backend/lib/household_assessments.php`). Endpoints in a new `backend/allocations/` folder only call the service. Old per-item `relief_allocations` rows become read-only history.

**Tech Stack:** PHP (XAMPP `C:/xampp/php/php.exe`), PDO/MariaDB, React 18 + React Router 6 + axios, Playwright for browser tests.

**Spec:** `docs/superpowers/specs/2026-10-17-relief-allocation-workflow-design.md`

## Global Constraints

- Damage points: `Destroyed` 20 · `Severely Damaged` 15 · `Partially Damaged` 10 · `Minor Damage` 5 · `No Damage` 0. UI labels: "Destroyed / uninhabitable", "Severely damaged", "Partially damaged", "Minor damage", "No damage".
- Automatic points unchanged: flood (recorded Purok) inside 40 / outside 20; size 7+ 20, 5–6 15, 3–4 10, 1–2 5; vulnerable 3+ 20, 2 15, 1 10, 0 0. Subtotal max 80; final max 100.
- Priority (final score only): 81–100 Critical Priority, 61–80 High Priority, 41–60 Moderate Priority, 0–40 Low Priority; outside 0–100 → `InvalidArgumentException`.
- Labels: no visit → `Pending Assessment`; missing source data → `For Verification`. Never 0 for missing data.
- Rule version: `final-v1 F40 recorded-Purok H20 V20 D20; max100`.
- Allocation statuses (DB enum, exact): `PENDING_ASSESSMENT`, `ASSESSMENT_IN_PROGRESS`, `READY_FOR_DISTRIBUTION`, `COMPLETED`, `CANCELLED`.
- Assessment statuses (existing enum): `pending_assignment`, `assigned`, `assessed`.
- Identity always `$_SESSION['user_id']`; client-sent points, totals, priority, actor ids are ignored.
- Every status change writes `household_allocation_history` (user_id, ip_address from `$_SERVER['REMOTE_ADDR']`).
- Legacy `relief_allocations` Pending/Approved rows → `Cancelled`, reason exactly `Replaced by the new allocation workflow`.
- Retired endpoints respond HTTP 410 JSON `{"success":false,"message":"This action was replaced by the new allocation workflow."}`.
- Tests run against isolated fixture databases only (`tests/user_management_fixture.php`), never `barangay_disaster_db`.
- The working tree holds unrelated uncommitted changes: stage only the files a task lists, and commit only after the user agrees to commits.

## Review Focus

1. A field officer double-taps Submit on a slow phone connection → one locked assessment, one transition, second request gets 409 "already submitted", no second history row. (Task 4)
2. Relief Personnel opens the completion dialog, an admin re-opens the allocation, personnel confirms → 409 "This allocation is no longer ready for distribution", no stock change. (Task 5)
3. Released quantities: negative, fractional, above planned, or all zero → 400 with the item named; release less than planned is accepted. (Task 5)
4. A relief item in a READY allocation's plan is deleted from inventory → deletion refused with the allocation count; if the row is gone anyway, completion fails with "<item name> is no longer in the inventory". (Tasks 5, 8)
5. A household with an open allocation is deleted, or an admin starts a new round while one is open → refused with a clear message, never two open allocations. (Tasks 3, 8)

---

### Task 1: Migration — allocation tables, per-round assessments, ledger columns, legacy cancel

**Files:**
- Create: `database/migration_phase32_relief_allocation_workflow.sql`
- Modify: `tests/user_management_fixture.php` (apply phase 32 after phase 31)
- Test: `tests/allocation_migration_test.php`

**Interfaces:**
- Produces tables/columns exactly as spec §7: `household_allocations` (with `active_household_id INT AS (IF(status IN ('COMPLETED','CANCELLED'),NULL,household_id)) PERSISTENT` + UNIQUE; indexes `status`, `household_id`, `(status, ready_score)`; UNIQUE `completion_key`), `household_allocation_items` (UNIQUE `(allocation_id,item_id)`), `household_allocation_history`; `household_field_assessments` + `allocation_id` UNIQUE, `damage_classification ENUM('Destroyed','Severely Damaged','Partially Damaged','Minor Damage','No Damage') NULL`, `draft_saved_at`, `locked_at`, `reopened_count INT NOT NULL DEFAULT 0`, UNIQUE on `household_id` dropped; `inventory_logs` + `previous_quantity INT NULL`, `allocation_ref INT NULL`; `relief_items` CHECK `chk_relief_items_quantity (quantity >= 0)`; setting row `standard_relief_package_id` (empty value).
- Seeds: one round-1 `PENDING_ASSESSMENT` allocation per household without an open one (history action `seed`); existing assessments get that `allocation_id`; legacy Pending/Approved → Cancelled with the global reason, one `audit_logs` row `Legacy allocations cancelled` with the ids.
- Every statement guarded (`IF NOT EXISTS`, `information_schema` checks) so running twice is a no-op.

- [ ] **Step 1: Write the failing test** `tests/allocation_migration_test.php`: build a fresh fixture DB (`php tests/user_management_fixture.php` JSON), insert one Approved and one Distributed legacy `relief_allocations` row, apply the migration twice, assert: 1 open allocation per household; Approved → Cancelled with the exact reason; Distributed unchanged; `UPDATE relief_items SET quantity=-1` raises a CHECK error; inserting a second open allocation for the same household raises a duplicate-key error; second run adds no rows. Drop the fixture DB in `finally`.
- [ ] **Step 2: Run** `C:/xampp/php/php.exe tests/allocation_migration_test.php` — expected FAIL (file not found).
- [ ] **Step 3: Write the migration** and add it to the fixture's migration list.
- [ ] **Step 4: Run** the test — expected `PASS allocation migration`. Re-run `node tests/automatic_scoring_integration_test.mjs` to confirm the fixture still builds.
- [ ] **Step 5: Commit** the migration, fixture and test — `feat(db): household allocation workflow schema (phase 32)`.

### Task 2: Final 100-point score in the shared scoring service

**Files:**
- Modify: `backend/lib/automatic_priority.php`
- Test: `tests/automatic_scoring_test.php`

**Interfaces:**
- Produces:
  - `const DSS_DAMAGE_POINTS = ['Destroyed'=>20,'Severely Damaged'=>15,'Partially Damaged'=>10,'Minor Damage'=>5,'No Damage'=>0];`
  - `const DSS_MODEL_VERSION = 'final-v1 F40 recorded-Purok H20 V20 D20; max100';`
  - `dss_household_score(?string $flood, ?int $members, ?int $vulnerable, ?string $damage): array` returning keys `automatic_subtotal` (int|null, max 80), `final_score` (int|null), `priority_score` (= final_score), `priority_level` (`Critical Priority`…`Low Priority` | `Pending Assessment` | `For Verification`), `score_complete` (bool, final exists), `automatic_complete` (bool), `score_breakdown` (`flood_zone`,`household_size`,`vulnerable_members`,`damage` → int|null), `damage_classification` (string|null), `maximum_automatic_subtotal` 80, `maximum_score` 100, `model_version`. Throws `InvalidArgumentException` for an unknown damage string, size < 1, vulnerable < 0 or > size.
  - `dss_priority_category(float $score): string` unchanged.
  - `dss_compute_priorities()` rows gain: `damage_classification`, `final_score`, `automatic_subtotal`, `assessment_status` (`Not Yet Assessed` | `No Damage — Assessed` | `<label> — Assessed`), `allocation_id`, `allocation_status` (from `household_allocations` when the table exists, else null). Damage comes (columns from Task 1) from the household's current-round assessment with `status='assessed'` and `locked_at` set.
  - `dss_automatic_score()` is removed; every caller uses `dss_household_score()`.

- [ ] **Step 1: Write the failing tests** — replace the provisional-model checks with:

```php
foreach ([['flood_prone',7,3,'Destroyed',100,'Critical Priority'],['flood_prone',5,2,'Severely Damaged',85,'Critical Priority'],
  ['flood_prone',7,3,'No Damage',80,'High Priority'],['flood_prone',5,1,'Severely Damaged',80,'High Priority'],
  ['flood_prone',4,1,'Minor Damage',65,'High Priority'],['not_designated',6,2,'Partially Damaged',60,'Moderate Priority'],
  ['not_designated',3,1,'Minor Damage',45,'Moderate Priority'],['not_designated',2,0,'No Damage',25,'Low Priority']] as [$z,$s,$v,$d,$t,$p]) {
  $r=dss_household_score($z,$s,$v,$d); auto_check($r['final_score']===$t && $r['priority_level']===$p && $r['score_complete'],"example $z/$s/$v/$d");
}
$r=dss_household_score('flood_prone',8,4,null);
auto_check($r['automatic_subtotal']===80 && $r['final_score']===null && $r['priority_level']==='Pending Assessment' && $r['score_breakdown']['damage']===null,'not yet assessed');
foreach (DSS_DAMAGE_POINTS as $d=>$pts) auto_check(dss_household_score('not_designated',2,0,$d)['score_breakdown']['damage']===$pts,"damage $d");
auto_check(dss_household_score('flood_prone',2,0,'No Damage')['final_score']===45 && dss_household_score('flood_prone',2,0,null)['final_score']===null,'no damage assessed differs from not assessed');
auto_reject(fn()=>dss_household_score('flood_prone',2,0,'Major'),'old damage scale rejected');
auto_check(dss_household_score(null,2,0,'Destroyed')['priority_level']==='For Verification','missing source data is For Verification even after a visit');
foreach ([-1,101] as $bad) auto_reject(fn()=>dss_priority_category($bad),"score $bad rejected");
auto_check(dss_method_summary()['maximum_automatic_subtotal']===80 && dss_method_summary()['maximum_score']===100,'max 80 / 100');
```

Keep the existing size 1–8, vulnerable 0–4, boundary 0/40/41/60/61/80/81/100, invalid-count and recorded-Purok flood checks, rewritten to call `dss_household_score(..., null)` and read `automatic_subtotal`.

- [ ] **Step 2: Run** `C:/xampp/php/php.exe tests/automatic_scoring_test.php` — expected FAIL `Call to undefined function dss_household_score()`.
- [ ] **Step 3: Implement** `dss_household_score` and update `dss_read_priorities`, `dss_method_summary` (`maximum_score`=>100, `damage_points`=>DSS_DAMAGE_POINTS, `provisional`=>false, criteria gain `damage`), and every caller found by `grep -rn "dss_automatic_score\|provisional\|maximum_automatic_subtotal" backend`. Ranking: complete final scores first, `final_score` desc, ties share rank; incomplete rows unranked and listed.
- [ ] **Step 4: Run** the test — expected `PASS: <n> automatic scoring checks`; also `C:/xampp/php/php.exe tests/flood_zones_unit_test.php` → `61/61 passed`.
- [ ] **Step 5: Commit** `backend/lib/automatic_priority.php tests/automatic_scoring_test.php` — `feat(scoring): 100-point final score with field-officer damage`.

### Task 3: Allocation state machine service

**Files:**
- Create: `backend/lib/allocation_workflow.php`
- Test: `tests/allocation_workflow_test.php` (isolated DB, direct function calls)

**Interfaces:**
- Consumes: `dss_compute_priorities()` row for one household via `aw_current_score(PDO,$hid): array` (filters the shared service; no second formula).
- Produces (all throw `AllocationWorkflowError extends RuntimeException` with HTTP code 400/403/404/409; caller owns nothing — each function opens and commits its own transaction unless `$conn->inTransaction()`):
  - `const AW_STATUSES`, `const AW_TRANSITIONS` (map from → allowed to, per spec §6).
  - `aw_open_allocation(PDO,int $hid, bool $lock=false): ?array`
  - `aw_transition(PDO,array $alloc,string $to,string $action,int $actorId,?string $reason=null,array $details=[]): array` — the only `UPDATE ... SET status`; rejects transitions not in `AW_TRANSITIONS` with `Cannot move an allocation from X to Y.`; bumps `version`; writes history.
  - `aw_promote_if_complete(PDO,int $hid,int $actorId): array` → `['promoted'=>bool,'reasons'=>string[]]`; promotes when assessment `assessed`+locked, score `score_complete`, standard package set/active/has items; stores ready snapshot (`ready_score`, `ready_priority`, `ready_snapshot` JSON of the score row's breakdown/values, `ready_rule_version`, `ready_at`, `package_id`) and copies package items into `household_allocation_items`; queues the Ready notification with `dispatch_notification(..., ['sms'=>true,'sms_defer'=>true,'event_type'=>'ALLOCATION_READY_FOR_DISTRIBUTION','link'=>'/resident/relief-status'])` and returns `queued_sms_ids`.
  - `aw_promote_all_waiting(PDO,int $actorId): int` (used after the standard package changes).
  - `aw_reopen(PDO,int $allocationId,int $actorId,string $reason)`, `aw_cancel(...)`, `aw_adjust_planned(PDO,int $allocationId,array $items,int $actorId,string $reason)` (admin only; READY only; quantities may only rise), `aw_start_round(PDO,int $hid,int $actorId)` (admin; refuses when an open allocation exists).
  - Reasons are required (trimmed, 3–500 chars) for reopen/cancel/adjust.

- [ ] **Step 1: Write failing tests**: every allowed transition succeeds and writes one history row with ip and actor; every disallowed pair throws 409 with the message above; promote is refused with each reason (`Field visit not yet submitted.`, `For Verification: <reason>`, `No standard relief package is set.`); promote copies package items and snapshot; reopen removes READY and unlocks the assessment (`locked_at` NULL, `status`='assigned', `reopened_count`+1); start round refused while open (Review Focus 5); non-admin actor gets 403 for reopen/cancel/adjust/start.
- [ ] **Step 2: Run** `C:/xampp/php/php.exe tests/allocation_workflow_test.php` → FAIL (missing file).
- [ ] **Step 3: Implement** `backend/lib/allocation_workflow.php`.
- [ ] **Step 4: Run** → `PASS allocation workflow`.
- [ ] **Step 5: Commit** — `feat(allocations): single state machine service`.

### Task 4: Field-officer draft and locked submission per round

**Files:**
- Modify: `backend/lib/household_assessments.php`
- Create: `backend/allocations/assessment_draft.php`, `backend/allocations/assessment_submit.php`
- Modify: `backend/disasters/submit_household_assessment.php` (delegates to the new submit), `backend/disasters/assign_household_assessment.php` (assignment targets the open allocation's assessment)
- Test: `tests/household_assessments_integration_test.php`

**Interfaces:**
- Consumes: `aw_open_allocation`, `aw_transition`, `aw_promote_if_complete`.
- Produces: `ha_save_draft(PDO,array $data,int $actorId): array` and `ha_submit(PDO,array $data,int $actorId): array` returning `['assessment'=>row,'allocation'=>row,'promoted'=>bool,'reasons'=>[]]`. `ha_validate_submission` requires `damage_classification` ∈ `DSS_DAMAGE_POINTS` keys, `field_visit_date` ≤ today (Asia/Manila), non-empty `findings`; drafts accept partial values. Submit sets `status='assessed'`, `locked_at=NOW()`, `submitted_at=NOW()`; a locked assessment returns 409 `This assessment is locked. An administrator must re-open it.`; first draft moves the allocation `PENDING_ASSESSMENT → ASSESSMENT_IN_PROGRESS`; submit + promote happen in one transaction. Ignored client keys: any `*_points`, `score`, `priority*`, `assigned_field_officer_id`.

- [ ] **Step 1: Extend the failing test**: draft saves without damage; submit without damage → 400; submit with all fields → `assessed`, locked, allocation READY when roster/vulnerability/purok complete and a standard package exists, else `ASSESSMENT_IN_PROGRESS` with reasons; second identical submit → 409 locked (Review Focus 1, exactly one `submission` revision); client `damage_points: 99` ignored; admin/relief/unassigned officer → 403; after `aw_reopen` the officer can submit again.
- [ ] **Step 2: Run** `C:/xampp/php/php.exe tests/household_assessments_integration_test.php` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `feat(assessments): drafts, locked submission, automatic Ready`.

### Task 5: Complete Distribution with all-or-nothing stock deduction

**Files:**
- Modify: `backend/lib/allocation_workflow.php`
- Create: `backend/allocations/complete.php`
- Test: `tests/allocation_completion_test.php`

**Interfaces:**
- Produces: `aw_complete_distribution(PDO,int $allocationId,array $input,int $actorId): array` where `$input` = `completion_key` (UUID string, required), `items` (`[{item_id, released_qty}]`), optional `recipient_name` (≤150), `remarks` (≤300), `proof_photo` (filename from the existing delivery-photo upload). Returns the completed allocation with `items` (planned, released, `remaining_stock`). Order inside one transaction: same `completion_key` already used → return that allocation unchanged (idempotent); lock allocation `FOR UPDATE`; require READY else 409 `This allocation is no longer ready for distribution.` (or `…already completed by <name> at <time>.`); validate released ints 0…planned, at least one > 0 (Review Focus 3); lock `relief_items` rows `ORDER BY item_id FOR UPDATE`; collect every shortage then throw 409 `Not enough stock: Rice 5kg: need 3, available 1; …`; missing item row → 409 `<item name> is no longer in the inventory.`; deduct with `quantity >= ?` guard; one `inventory_logs` row per released item (`log_type='Stock Out'`, `quantity_change=-qty`, `previous_quantity`, `resulting_quantity`, `reference='Household allocation #<id>'`, `allocation_ref`, `performed_by`); completed snapshot from `aw_current_score`; transition to COMPLETED.
- Endpoint role: `relief_personnel` only, plus Purok scope (`field_scope` rules); out-of-scope → 404.

- [ ] **Step 1: Write failing tests**: success deducts and logs before/after; shortage on one of two items rolls back both items, the status and the ledger; same key twice → one deduction; two PHP processes (`proc_open` twice on a small script calling the function with different keys) → exactly one COMPLETED, the other 409, stock deducted once; released above planned → 400; all zero → 400; reopened-before-confirm → 409 (Review Focus 2); deleted item → 409 with its name (Review Focus 4).
- [ ] **Step 2: Run** `C:/xampp/php/php.exe tests/allocation_completion_test.php` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `feat(allocations): locked all-or-nothing distribution completion`.

### Task 6: Allocation API endpoints and retirement of old paths

**Files:**
- Create in `backend/allocations/`: `ready_list.php`, `get.php`, `list.php`, `history.php`, `reopen.php`, `cancel.php`, `adjust_planned.php`, `start_round.php`; `backend/relief/packages/set_standard.php`
- Modify to return 410 (global message): `backend/relief/create_allocation.php`, `approve_allocation.php`, `mark_ready.php`, `distribute.php`, `emergency_override.php`, `approve_recommendation.php`, `reject_recommendation.php`, `restore_recommendation.php`; remove allocation creation from `backend/requests/process_request.php`, `backend/requests/decide_request.php`, `backend/relief/schedules/update_beneficiary_status.php` (decision recorded, response says relief now goes through the allocation workflow)
- Modify: `frontend/src/services/api.jsx` (new client functions, old ones removed)
- Test: `tests/allocation_api_integration_test.mjs` (pattern of `tests/automatic_scoring_integration_test.mjs`)

**Interfaces:**
- `GET allocations/ready_list.php?q=&purok=&priority=` → `{data:[{allocation_id, household_id, head_of_family, purok, ready_score, ready_priority, breakdown, items:[{item_id,item_name,unit,planned_qty,current_stock}], assessed_by_name, field_visit_date, ready_at}]}`; SQL `WHERE a.status='READY_FOR_DISTRIBUTION'`, personnel Purok scope, `ORDER BY ready_score DESC, ready_at ASC, allocation_id ASC`. Roles: relief_personnel, admin.
- `GET allocations/get.php?id=` → one allocation; for relief_personnel non-READY or out-of-scope → 404 `Allocation not found.`
- `GET allocations/list.php?status=&q=` (admin) → new allocations with current score + `legacy` array of old `relief_allocations` labelled `Historical`.
- `GET allocations/history.php?id=` (admin) → history rows with actor names.
- `POST reopen|cancel|adjust_planned|start_round`, `POST relief/packages/set_standard.php {package_id}` (admin; then `aw_promote_all_waiting`; sends queued SMS after commit with `sms_process_queued`).
- Frontend `api.jsx`: `getReadyAllocations(params)`, `getAllocation(id)`, `getAllocations(params)`, `getAllocationHistory(id)`, `completeAllocation(id, body)`, `reopenAllocation`, `cancelAllocation`, `adjustPlanned`, `startAllocationRound`, `setStandardPackage`, `saveAssessmentDraft`, `submitAssessment`.

- [ ] **Step 1: Write the failing integration test**: officer submit through the API makes the household READY; personnel list contains only READY rows (seed one of each status); personnel `get.php` of PENDING / ASSESSMENT_IN_PROGRESS / COMPLETED / CANCELLED / other Purok → 404; resident and field officer on `ready_list.php` → 403; complete via API deducts stock and returns remaining stock; admin reopen → absent from the next list; each retired endpoint → 410; score/priority in `ready_list`, `dashboard/priority_list.php`, CSV and `reports/household_reports.php` agree; COMPLETED snapshot unchanged after editing members.
- [ ] **Step 2: Run** `node tests/allocation_api_integration_test.mjs` → FAIL.
- [ ] **Step 3: Implement** endpoints, retirements and `api.jsx` functions.
- [ ] **Step 4: Run** → `PASS: <n> allocation API checks`.
- [ ] **Step 5: Commit** — `feat(allocations): API, Ready-only personnel access, retire old paths`.

### Task 7: Automatic promotion hooks and new-household allocation

**Files:**
- Modify: `backend/households/members/verify_roster.php`, `backend/households/members/write_member.php`, `backend/households/update_household.php`, `backend/households/add_household.php`
- Test: extend `tests/allocation_api_integration_test.mjs`

**Interfaces:** after each successful commit call `aw_promote_if_complete($conn,$hid,$actor)` (and send queued SMS); `add_household.php` inserts the round-1 `PENDING_ASSESSMENT` allocation in its transaction (history action `created`).

- [ ] **Step 1: Failing checks**: a submitted visit blocked by an unverified roster becomes READY right after the admin verifies the roster; a new household appears with a PENDING_ASSESSMENT allocation; editing a READY household's members leaves the READY snapshot unchanged while `current` score changes.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `feat(allocations): promote when verification completes`.

### Task 8: Dashboards, reports, exports and guards on the new tables

**Files (modify):** `backend/dashboard/overview.php`, `statistics.php`, `personnel_stats.php`, `priority_list.php` (CSV columns: damage classification, damage points, automatic subtotal / 80, final score / 100, priority, assessment status, allocation status), `relief_recommendations.php` (read-only ranking, no approve), `backend/reports/relief_reports.php`, `situation_report.php`, `dashboard_analytics.php`, `inventory_reconciliation.php` (no committed/reserved stock; Stock Out ties to `allocation_ref`), `household_reports.php`, `backend/inventory/get_items.php`, `stock_out.php`, `adjust_quantity.php` (available = stock; no reservation), `delete_item.php` (refuse while used by a READY allocation or the standard package: `Used by N ready allocation(s) or the standard package.`), `backend/households/delete_household.php` and `backend/users/delete_user.php` (refuse while an open allocation exists / user is referenced), `backend/lib/affected_areas.php`, `backend/lib/feedback.php` (feedback after COMPLETED), `backend/lib/requests.php`, `backend/requests/get_request_detail.php`, `backend/relief/get_allocations.php` (legacy history only).
- Test: extend `tests/allocation_api_integration_test.mjs`; re-run all existing suites.

- [ ] **Step 1: Failing checks**: overview KPIs count `PENDING_ASSESSMENT`/`ASSESSMENT_IN_PROGRESS`/`READY`/`COMPLETED` from `household_allocations`; relief report lists completed distributions with released items and snapshot scores plus legacy rows labelled historical; deleting an item in a READY plan → 409 (Review Focus 4); deleting a household with an open allocation → 409 (Review Focus 5); reconciliation balances after a completion.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** the new test and `tests/automatic_scoring_integration_test.mjs`, `tests/household_assessments_integration_test.php`, `tests/flood_zones_unit_test.php`, `PATH=/c/xampp/php:$PATH node tests/purok_boundaries_js_test.mjs`, `node tests/landing_adapter_test.mjs` → all PASS (update their expectations where they asserted the provisional/80 model or old approval paths).
- [ ] **Step 5: Commit** — `feat(reports): dashboards and exports read the allocation workflow`.

### Task 9: Field Officer assessment screen

**Files:**
- Create: `frontend/src/pages/field/AssessmentForm.jsx`, `frontend/src/components/DamageClassificationPicker.jsx`
- Modify: `frontend/src/pages/shared/HouseholdFieldAssessments.jsx` (list → "For Assessment", opens the form), `frontend/src/App.jsx` (route `/field/assessments/:householdId`), `frontend/src/components/PriorityExplanation.jsx` (four components, /80 and /100, statuses)

**Interfaces:** `DamageClassificationPicker({ value, onChange, disabled })` — radio group with the five labels and points from the API `method.criteria.damage` (no hard-coded points). Preview total = API subtotal + selected damage points, labelled "Preview — the server calculates the final score". Submit opens `Modal` with "This assessment will be locked after submission." Buttons disable while saving.

- [ ] **Step 1:** Implement the page and picker; locked assessments render read-only with "Locked — ask an administrator to re-open".
- [ ] **Step 2:** `npx vite build` (frontend) → `built in`.
- [ ] **Step 3: Commit** — `feat(field): assessment form with damage classification`.

### Task 10: Relief Personnel Ready list and Complete Distribution

**Files:**
- Modify: `frontend/src/pages/personnel/AssignedRelief.jsx` (becomes "Ready for Distribution"), `frontend/src/pages/personnel/PersonnelDashboard.jsx`
- Create: `frontend/src/components/CompleteDistributionModal.jsx`

**Interfaces:** list from `getReadyAllocations` with search + Purok + priority filters; detail shows breakdown, final score, priority badge (text), planned items, officer, visit date. Modal: one number input per item (min 0, max planned, default planned), recipient, remarks, optional photo via the existing delivery-photo upload; a `crypto.randomUUID()` completion key created when the modal opens and reused on retry; confirm button disabled while sending; success toast `Distribution completed. Remaining stock: Rice 5kg 42 sacks, …`; API error text shown verbatim.

- [ ] **Step 1:** Implement. **Step 2:** `npx vite build` → `built in`. **Step 3: Commit** — `feat(personnel): ready-only list and completion dialog`.

### Task 11: Administrator allocations, standard package, retired UI

**Files:**
- Modify: `frontend/src/pages/admin/ReliefAllocation.jsx` (status tabs, current vs snapshot score labels, re-open / cancel / adjust planned / start new round dialogs with required reason, history drawer, legacy tab), Relief Packages page (find with `grep -rln "getPackages" frontend/src/pages`) — "Use as standard package" action and badge; `frontend/src/pages/admin/ReliefRecommendations.jsx` (read-only ranking, approve buttons removed), relief request detail and schedule pages (decision buttons no longer promise allocations); `frontend/src/pages/resident/ReliefStatus.jsx`, `ResidentDashboard.jsx` (new statuses in plain words); `frontend/src/components/dashboard/*` pipeline labels; `frontend/src/pages/admin/Personnel.jsx`.

- [ ] **Step 1:** Implement. **Step 2:** `npx vite build` → `built in`. **Step 3: Commit** — `feat(admin): allocation oversight and standard package`.

### Task 12: Browser test, docs, live migration

**Files:**
- Modify: `tests/automatic_scoring_browser_test.mjs` → covers: officer form at 390×844 (damage picker, confirmation dialog, locked view), personnel completion at 390×844 and 1440×900, admin re-open removing the row; no page errors; no horizontal scroll.
- Modify: `PRODUCT.md` (Operating Context workflow line), `DESIGN.md` (allocation status tones: Pending Assessment neutral, In Progress warning, Ready navy, Completed ok, Cancelled danger), `docs/PROVISIONAL_RELIEF_SCORING.md` (superseded note), `docs/household-field-assessments.md`.

- [ ] **Step 1:** Run the browser test → PASS.
- [ ] **Step 2:** With the user's go-ahead, back up `barangay_disaster_db` (`C:/xampp/mysql/bin/mysqldump.exe barangay_disaster_db > <scratchpad>/pre-phase32.sql`) and apply `migration_phase32_relief_allocation_workflow.sql` to it; confirm 8 households have one open allocation and the 7 Approved legacy rows are Cancelled.
- [ ] **Step 3: Commit** docs + test — `docs: relief allocation workflow`.

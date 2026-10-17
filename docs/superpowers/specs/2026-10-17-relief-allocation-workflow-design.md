# Relief Allocation Workflow — 100-point scoring, field-officer damage, ready-only distribution

Status: draft for approval · 2026-10-17

## 1. Intent

Relief should reach a household only after an actual field visit, and the visit should finish the household's
score. Today the score stops at a provisional 80 points (damage was undefined), an administrator approves every
allocation item by item, and stock is reserved at approval. The barangay wants:

- A **100-point score**: the existing automatic 80 points plus **household damage (20 points)** chosen by the
  assigned Field Officer during the visit.
- **No approval step.** A complete visit moves the household's allocation to **Ready for Distribution**
  automatically. Relief Personnel see only Ready households and complete the distribution.
- **Stock leaves the inventory only when Relief Personnel complete a distribution**, in one locked transaction
  with a stock ledger row per item.
- Every step traceable: who, what, before/after status, when, from which IP.

## 2. Goals

1. One shared scoring service: flood zone 40 + household size 20 + vulnerable members 20 + damage 20 = 100.
2. Field Officer assessment: draft → submit (locked) → admin re-open with reason (logged).
3. One household-level allocation per round with the state machine in §6, all transitions in one service.
4. Planned items come from **one standard relief package** that the Administrator chooses (user decision).
5. Relief Personnel list/API returns **only** Ready allocations; completion deducts stock atomically.
6. Score snapshots at Ready and at Completed; history never overwritten.
7. Every screen, report and export reads the same service and the same thresholds.

## 3. Non-goals / anti-goals

- **No new scoring rules** beyond the four tables in the brief. Infrastructure, property and agricultural damage
  stay recorded as notes with no points.
- **No coordinate-based flood scoring.** Flood zone stays from the recorded Purok: Puroks 1–4 inside (40),
  5A–7 outside (20), unknown Purok flagged (user decision, 2026-10-17).
- A high score never releases goods by itself; only Relief Personnel completion does.
- No stock reservation before completion. Two Ready households can plan the same last unit; the second
  completion fails with a clear shortage message (accepted consequence of the brief).
- Unassessed is never 0 damage; missing data is never 0 points; incomplete households are never ranked lowest
  or hidden.
- No silent rewriting of history: old allocations, old snapshots and old assessment evidence stay readable.

## 4. Decisions made by the user

| Topic | Decision |
|---|---|
| Damage points | Destroyed / uninhabitable 20 · Severely damaged 15 · Partially damaged 10 · Minor damage 5 · No damage 0 |
| Who decides relief | The system: complete field visit → Ready automatically. No admin approval. |
| Planned items | One standard relief package for every Ready household |
| Old paths | **Replace all**: Add Allocation/approval, recommendation approval, relief requests → allocation, emergency override, schedules → allocation, Mark Ready, old Distribute are retired. Past records stay as history. |
| Repeat rounds | One allocation at a time per household; an Administrator starts a new round |
| Flood zone | Recorded Purok rule (not coordinates) |

## 5. Scoring (one service: `backend/lib/automatic_priority.php`)

- Components and points exactly as the brief (§2.1–2.4). Damage classification values are constants
  (`DSS_DAMAGE_POINTS`), mapped to points only on the backend; client points are ignored.
- **Before the visit**: automatic subtotal (/80) is shown; final score and priority are absent; label
  **Pending Assessment**.
- **Final score (/100)** exists only when all four components are complete and verified; priority uses the
  existing inclusive ranges (81–100 Critical, 61–80 High, 41–60 Moderate, 0–40 Low; outside 0–100 rejected).
- Rule version string bumps to `final-v1 F40 recorded-Purok H20 V20 D20; max100`.
- The frontend never computes thresholds; it shows labels from the API (existing `config/priority.js` badges).

## 6. Allocation state machine (`backend/lib/allocation_workflow.php`, the only writer of status)

```
PENDING_ASSESSMENT ──(officer saves draft / submits with missing data)──▶ ASSESSMENT_IN_PROGRESS
ASSESSMENT_IN_PROGRESS ──(system: submitted visit + all 4 components complete + standard package set)──▶ READY_FOR_DISTRIBUTION
PENDING_ASSESSMENT ──(same system condition, at submit)──▶ READY_FOR_DISTRIBUTION
READY_FOR_DISTRIBUTION ──(Relief Personnel complete; stock deducted)──▶ COMPLETED
READY_FOR_DISTRIBUTION ──(Admin cancel, reason)──▶ CANCELLED
READY_FOR_DISTRIBUTION ──(Admin re-open, reason)──▶ ASSESSMENT_IN_PROGRESS   (assessment unlocked)
COMPLETED / CANCELLED ──(Admin "Start new round")──▶ new allocation row in PENDING_ASSESSMENT
```

Service functions: `aw_save_draft`, `aw_submit_assessment`, `aw_promote_if_complete`, `aw_reopen`, `aw_cancel`,
`aw_adjust_planned` (admin override), `aw_complete_distribution`, `aw_start_round`. Each validates the transition,
locks the allocation row (`FOR UPDATE`), writes a status-history row, and throws a descriptive error for an invalid
transition. Endpoints only call these.

**Automatic promotion** (`aw_promote_if_complete`) runs inside the submit transaction, and also after an
Administrator verifies the roster / a member's vulnerability, changes a Purok, or sets the standard package — so
a household whose only blocker was unverified data or a missing package becomes Ready without a button. If it
cannot promote, the allocation stays in ASSESSMENT_IN_PROGRESS and the API returns the reasons.

## 7. Data model (`database/migration_phase32_relief_allocation_workflow.sql`, repeatable)

- `household_allocations` — allocation_id, household_id, round_no, status (enum of the 5 states), package_id,
  ready_at / ready_score / ready_priority / ready_snapshot (JSON) / ready_rule_version,
  completed_by / completed_at / completed_score / completed_priority / completed_snapshot / completed_rule_version,
  recipient_name, proof_photo, completion_remarks, completion_key (UNIQUE, idempotency),
  cancelled_by / cancelled_at / cancel_reason, created_by, created_at, updated_at, version.
  `active_household_id` PERSISTENT generated column (household_id while not COMPLETED/CANCELLED) with a UNIQUE
  index → at most one open allocation per household. Indexes: status, household_id, (status, ready_score).
- `household_allocation_items` — allocation_id, item_id, item_name and unit at planning time, planned_qty,
  released_qty (NULL until completion).
- `household_allocation_history` — allocation_id, action, from_status, to_status, reason, details JSON, user_id,
  ip_address, created_at.
- `household_field_assessments` — add `allocation_id` (UNIQUE; assessments become per round), drop the UNIQUE on
  household_id, add `damage_classification` enum (5 levels), `draft_saved_at`, `locked_at`, `reopened_count`.
  The old `house_damage` column stays for history and is not scored.
- `inventory_logs` — add `previous_quantity` and `allocation_ref` (household_allocations id). Stock Out rows from
  completion carry change, before, after, user, timestamp.
- `relief_items` — `CHECK (quantity >= 0)` (MariaDB 10.4 enforces CHECK; live data has no negative rows).
- `system_settings` — `standard_relief_package_id`.
- Seed: one round-1 PENDING_ASSESSMENT allocation for every household without an open one; existing assessment
  rows link to it. New households get one on creation.

Old `relief_allocations` rows are untouched and shown as **history** wherever allocations are listed.

## 8. Endpoints and permissions (backend enforced; identity always from the session)

| Endpoint | Role | Notes |
|---|---|---|
| `allocations/assessment_draft.php` | assigned Field Officer | save draft; not locked |
| `allocations/assessment_submit.php` | assigned Field Officer | lock + compute + promote, one transaction |
| `allocations/ready_list.php` | Relief Personnel, Admin | **SQL filters status = READY**; Purok scope for personnel; search head/ID/Purok; filter Purok/priority; sort ready_score desc, ready_at asc |
| `allocations/get.php` | role-checked | Relief Personnel get 404 for anything not READY in their scope |
| `allocations/complete.php` | Relief Personnel | idempotency key; locks allocation then items (ascending item_id); all-or-nothing; per-item shortage list |
| `allocations/reopen.php`, `cancel.php`, `adjust_planned.php`, `start_round.php` | Admin | reason required; logged |
| `allocations/list.php` | Admin | all states + legacy history |
| `allocations/history.php` | Admin | status history / audit view |
| `relief/packages/set_standard.php` | Admin | choose the standard package (active, has items) |

Retired (return 410 Gone with a message): `relief/create_allocation.php`, `approve_allocation.php`,
`mark_ready.php`, `distribute.php`, `emergency_override.php`, `approve_recommendation.php`,
`reject_recommendation.php`, `restore_recommendation.php`, allocation creation inside `requests/process_request.php`,
`requests/decide_request.php` and `relief/schedules/update_beneficiary_status.php`. Their read-only history views stay.

CSRF: the app uses session cookies with JSON bodies and a CORS allow-list; state-changing endpoints keep the
existing JSON-only + Origin checks in `config/cors.php`.

## 9. Interface

- **Field Officer** — "For Assessment" list (their assignments) → assessment page: automatic components
  read-only with points, damage as five labelled radio cards, findings/remarks/photos, live preview (display only),
  Save draft / Submit with a confirmation dialog ("This assessment will be locked after submission"). Phone-first.
- **Relief Personnel** — "Ready for Distribution" list → detail (breakdown, final score, priority, planned items,
  officer, visit date) → Complete Distribution dialog (released quantities default to planned, cannot exceed;
  recipient, photo, remarks; button disabled while sending) → success toast with remaining stock.
- **Administrator** — Allocations page (all states, history tab, re-open / cancel / adjust / start round),
  standard-package selector on Relief Packages, assignment of officers (existing), audit view.
- **Everywhere a household score shows**: four components with points or "Not Yet Assessed"/"For Verification",
  subtotal /80, final /100 when assessed, priority badge with text, assessment status, allocation status,
  officer and visit date. Current scores and snapshot scores are labelled separately.
- Dashboards/reports/exports (`overview`, `statistics`, `personnel_stats`, `relief_reports`, `situation_report`,
  `dashboard_analytics`, `inventory_reconciliation`, priority CSV, resident Relief Status) read the new tables
  (and legacy history) through the shared service.

## 10. Edge cases (brief §edge) and how they are met

1. Concurrent completion — allocation row `FOR UPDATE` + status re-check; second caller gets "already completed by X".
2. Stock runs out — item rows locked, all items checked first, whole transaction rolled back, shortage list returned.
3. Missing criteria — submit rejects a missing damage classification / visit date / findings; other missing data
   keeps the allocation out of READY with reasons.
4. Non-ready access by URL/API — query filters status; detail returns 404 for non-ready.
5. Double click / network retry — button disabled + `completion_key` UNIQUE; a retried key returns the first result.
6. Admin re-open — status leaves READY, so the next list query excludes it.
7. Item deleted while referenced — deletion blocked while a READY allocation or the standard package uses it;
   completion fails cleanly if an item row is gone.

## 11. Calls I made (the builder may follow these unless the user objects)

- Assignment alone keeps PENDING_ASSESSMENT; a saved draft (or a submit blocked by unverified data) is
  ASSESSMENT_IN_PROGRESS.
- If no standard package is set, a submitted visit is saved and locked but the allocation waits in
  ASSESSMENT_IN_PROGRESS with the reason; setting the package promotes it.
- A READY allocation keeps its Ready snapshot even if household data later changes; the current score is shown
  next to it, labelled "current".
- The existing automated SMS on "Ready for Distribution" is kept and sent on automatic promotion, without the
  old schedule/location fields (those were typed at Mark Ready, which no longer exists).
- Field Officers keep their current permissions: they cannot verify rosters or vulnerability (Administrator only).
- Purok is used where the brief says "barangay" for search and filters (single-barangay system).
- Relief-request and schedule records remain viewable as history; they no longer create allocations.
- Admin "adjust planned" is the brief's over-release override: raises planned quantities on a READY allocation
  with a reason, logged.

## 12. Legacy in-flight allocations (user decision)

The migration cancels every old `relief_allocations` row still in Pending or Approved (7 Approved in the live
database) with `cancel_reason = 'Replaced by the new allocation workflow'`, `cancelled_at = NOW()`, and an
audit-log entry. No stock changes (approval never deducted stock). Distributed and Cancelled rows are untouched.
Each affected household then follows the new flow.

## 13. Verification

Unit (PHP): the brief's nine full examples, priority boundaries (−1, 0, 40, 41, 60, 61, 80, 81, 100, 101), sizes
1–8, vulnerable 0–4, each damage level, distinct-person counting, vulnerable > size rejected, unknown Purok flagged,
missing vulnerability ≠ 0, Not Yet Assessed ≠ No Damage.
Integration (isolated fixture DB, real API): assignment/authorization, session identity, client points ignored,
auto READY in the same transaction, READY-only list and 404 detail for personnel, deduction + ledger rows,
insufficient-stock rollback, two parallel completions (one succeeds), idempotent retry, re-open removes from list,
scores agree across list/report/CSV, snapshots unchanged after recalculation.
Browser (Playwright): officer form on 390 px, personnel completion dialog, admin re-open.

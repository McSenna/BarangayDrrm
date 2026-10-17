# Provisional automatic scoring and field visits

> **Superseded (2026-10-17).** Scoring is now `final-v1 F40 recorded-Purok H20 V20 D20; max100`: the field officer's damage classification adds 0–20 points and a final score exists only after the visit is submitted. See `docs/superpowers/specs/2026-10-17-relief-allocation-workflow-design.md`.

The current rule is `automatic-v2 F40 H20 V20; max80; provisional; damage undefined`.

Flood locations inside the system's designated flood zone receive 40 points; outside receive 20. Household sizes 7+, 5–6, 3–4, 1–2 receive 20, 15, 10, 5. Distinct vulnerable people 3+, 2, 1, 0 receive 20, 15, 10, 0. The maximum automatic subtotal is **80**, with no rescaling and no damage contribution. Missing inputs remain null and prevent a complete subtotal.

Exact inclusive priority bands are 0–40 Low, 41–60 Moderate, 61–80 High, 81–100 Critical. Noninteger, nonfinite and out-of-range scores are rejected. All complete scores are provisional. Critical is configured but unreachable with the current automatic criteria.

## Sources and verification

The flood result comes from the existing server-side point-in-polygon map classifier and Puroks 1–4 designation. It does not come from stored Purok text or inferred household damage. The repository's boundaries remain candidate geography. An administrator checks the map and confirms the household's saved location/designation in its current score breakdown. Confirmation is bound to coordinates, stored Purok, boundary-file contents and designation list. A source change invalidates it. Unknown, ambiguous, outside-barangay or unmapped locations cannot be confirmed as outside the flood zone. The map continues showing candidate geography; scoring separately shows whether the location has been confirmed.

Member rows are the source of truth. Each person has six vulnerability attributes, with unknown separate from no, and administrator verification metadata. Age-derived child (under 18) and senior (60+) attributes follow the existing profile categories. The complete roster must contain the named head exactly once. Duplicate identities and invalid counts are rejected. A person in several categories contributes one vulnerable member. Roster changes invalidate verification; edits cannot inject trusted aggregate totals. Legacy aggregate figures remain declared/unverified until a roster is verified.

Complete scores rank descending, with equal scores sharing a rank. Stable household-ID ordering only arranges tied rows. The old severity/damage tie factors are retired because those components no longer belong to the score. Existing usable-report allocation eligibility and explicit administrator approval remain separate. Incomplete households remain visible with verification flags and in the recommendations' verification list; emergency procedures and inventory/quantity controls remain available under their existing rules.

## Field visits

See [household-field-assessments.md](household-field-assessments.md). Administrators assign an active Field Officer in the household's Purok. Only that assigned officer can submit or edit an actual visit, with date, explicit damage classification and findings. Remarks and protected photographs are optional. Status moves from Pending Assignment to Assigned / Pending Visit to Assessed. No Damage — Assessed is distinct from Not Yet Assessed. Session identity, active account/Purok checks, row locks, optimistic versions and full before/after revisions protect changes. Reassignment retains earlier evidence in revisions and does not claim a new visit is completed. Legacy report assessments and photographs remain historical evidence.

## Current versus historical scores

Current scores are recalculated from verified sources on each new request. Allocation approval stores a snapshot with the rule version, component points, completeness and provisional status. Distribution snapshots are never recalculated in place. Allocation screens display the recorded snapshot separately from the current breakdown. The priority CSV and household-report/PDF output use the same PHP calculation. Old scores retain their original category and rule version; a recorded 93/Critical under a historical rule stays recorded as 93/Critical.

## Installation

After existing migrations 26–28, apply these additive migrations in order:

1. `database/migration_phase29_household_assessments.sql`: household assignments, visits, revisions and protected evidence.
2. `database/migration_phase30_verified_household_members.sql`: per-person vulnerability and roster verification.
3. `database/migration_phase31_verified_flood_scoring.sql`: flood-location verification metadata.

For the configured local development database, run `C:\xampp\php\php.exe database/apply_provisional_scoring_migrations.php`. It checks record counts and historical snapshots before/after; it does not mark any existing data verified. Repeatable migrations preserve existing records. Production migration and deployment need the normal deployment process.

## Verification

The new pure rule tests and isolated API tests cover the five supplied examples, each size/vulnerability band, exact priority boundaries, invalid scores/counts, unknown inputs versus verified zero, distinct vulnerability unions, confirmed geometry, stale confirmation, source changes, tied ranks, report/CSV agreement, explicit approval, historical snapshots and repeatable migrations. Assigned visit tests cover session roles, reassignment, stale versions, dates/findings/categories, evidence and revision history. Browser tests cover the assignment UI at desktop/mobile sizes; current scoring browser checks cover breakdowns, verification, CSV and responsive layout. The completion report records which commands actually ran.

Legacy phase-22 weighted-model tests and old research documents describe the retired formula. Their assumptions (including admin/relief damage editing) are superseded by this policy; they are not evidence for the current rule. `tests/run_all.sh` is a destructive historical Linux harness and must not be run on the application database.

## Unresolved policy

Damage points remain **undefined**, including points for None/Minor/Major/Totally Damaged, their maximum and whether they can combine with the 80-point subtotal. No 20-point damage scale has been assumed. Adviser/barangay confirmation is needed before adding any damage-inclusive final score. Actual field assessment completion is independent of this policy question.

Manual follow-up: verify real rosters and vulnerability information, verify saved locations/designations against authoritative local knowledge, assign and conduct actual household visits, and validate production hosting/authenticated photo behavior during deployment. No synthetic tests can attest a real field visit or certify candidate boundaries.

## Change manifest

Core backend: `backend/lib/dss.php`, `automatic_priority.php`, `purok_boundaries.php`, `household_profile.php`, `household_assessments.php`, `allocation_service.php`, `requests.php`.

Household APIs: `backend/households/add_household.php`, `update_household.php`, `delete_household.php`, `verify_flood_location.php`; `members/add_member.php`, `update_member.php`, `delete_member.php`, `get_members.php`, `write_member.php`, `verify_roster.php`.

Assessment APIs: `backend/disasters/list_household_assessments.php`, `assign_household_assessment.php`, `submit_household_assessment.php`, `household_assessment_photos.php`, `download_household_assessment_photo.php`, plus existing `save_damage_assessment.php`, `get_reports.php`, `delete_photo.php`. Report-linked historical assessments are retained by the existing read endpoint.

Consumers: `backend/dashboard/priority_list.php`, `relief_recommendations.php`, `overview.php`, `statistics.php`; `backend/relief/get_allocations.php`; `backend/requests/get_requests.php`, `get_request_detail.php`; `backend/hazards/areas/get_affected_households.php`; `backend/reports/household_reports.php`, `relief_reports.php`, `situation_report.php`.

Frontend: `frontend/src/App.jsx`, `services/api.jsx`, `config/priority.js`, `theme/mapTokens.js`, `utils/householdAssessment.js`, `utils/pdfExport.js`; shared components `PriorityExplanation.jsx`, `HouseholdScoreSummary.jsx`, `BeneficiaryPicker.jsx`, `BarangayMap.jsx`, `BarangayMapView.jsx`, `gis/GisPopups.jsx`, `dashboard/WorkQueue.jsx`, `ui/StatusBadge.jsx`, `shell/navConfig.js`; admin pages `Households.jsx`, `PriorityList.jsx`, `ReliefAllocation.jsx`, `ReliefRecommendations.jsx`, `ReliefRequests.jsx`, `ReliefRequestReview.jsx`, `AffectedAreas.jsx`, `DisasterReports.jsx`, `reports/SituationReport.jsx`; shared pages `HouseholdFieldAssessments.jsx`, `HazardMonitoring.jsx`, `PaperAssessmentForm.jsx`; field pages `FieldHouseholds.jsx`, `FieldDashboard.jsx`; personnel pages `AssignedRelief.jsx`, `PersonnelDashboard.jsx`.

Database/setup: migrations 29–31 and `database/apply_provisional_scoring_migrations.php`; `README.md`, `PRODUCT.md`, account/assessment documentation and the implementation plan. The old criteria research document is marked historical.

Tests: `automatic_scoring_test.php`, `automatic_scoring_integration_test.mjs`, `automatic_scoring_snapshot_test.php`, `automatic_scoring_browser_test.mjs`, `verified_household_profile_test.php`, `verified_household_members_test.mjs`, `household_counts_test.php`, `household_assessments_unit_test.php`, `household_assessments_required_damage_test.php`, `household_assessments_identity_test.php`, `household_assessments_null_categories_test.php`, `household_assessments_integration_test.php`, `household_assessment_ui_test.mjs`, `household_assessment_browser_test.mjs`. The shared isolated fixture applies the new migrations; the former weighted unit-test command now forwards to current rule tests.

## Executed verification, 17 October 2026

- Automatic rule unit tests: **43 passed**, including all supplied examples, exact boundaries, invalid values, missing data and verified zero.
- Isolated full-schema HTTP scoring/assessment tests: **69 passed**. Includes actual authenticated sessions, protected photo upload/download, legacy-versus-current damage fields, ordinary recommendation approval, forged score/actor inputs, report/CSV agreement, source changes, history and repeatable migrations.
- Scoring Chrome checks: **12 passed**: current breakdown, source confirmation, provisional limitations, incomplete filtering, historical snapshot labels, CSV and generated PDF download, desktop/mobile containment and no page errors. Screenshots inspected. Generated household PDF text and both pages inspected; Unicode punctuation was made compatible with the existing PDF font.
- Independent assessment validation/identity/null-category unit tests and isolated assignment/authorization/revision/concurrency integration passed. Verified-person/count unit tests and isolated member CRUD/verification API tests passed.
- Assessment UI helper and controlled-API Chrome workflows passed for admin, assigned officer, unassigned/read-only roles, evidence failure/retry, legacy evidence and mobile layout.
- Concurrent source-read regression passed: a roster edit between household and member reads cannot combine stale verification with changed people; the next read requires verification.
- Map geometry unit tests: **49 passed**; flood designation/classification tests: **47 passed**. A Windows `is_readable()` false negative was reproduced and fixed by using the actual file read.
- Existing account/role HTTP regression: **60 passed**. Backend PHP syntax checks (**180 files**), migration-helper syntax, whitespace checks and frontend production build passed. The existing large JavaScript bundle warning remains.
- Migrations 29–31 applied twice to the configured **local** application database with unchanged record counts and historical scoring snapshots. A read-only current-score check found eight households, all correctly requiring source verification. No real roster/location was attested and no real assessment/distribution was changed.

Code inspection supplemented execution for legacy request/report paths and untouched inventory/distribution procedure logic. Production deployment, real officer visits, authoritative boundary certification and the destructive historical Linux full-system harness were **not** executed.

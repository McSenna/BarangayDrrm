# User management

Available under **Administration → Users**, preserving `/admin/administrators` bookmarks. Uses the existing React/PHP/MySQL authentication and role model. Registration approval requires the additive Phase 26 migration described below. No new packages are needed. Existing map/landing work was not modified by this feature. Nothing was deployed to production.

## Behavior

- Active users: approved and `is_active = 1`; Deactivated: approved and `is_active = 0`; Requests: pending registrations; Rejected: rejected registrations; All accounts: every state. All three roles are managed here.
- Household masterlist, Resident masterlist and Relief Personnel switch content within `/admin/administrators` using `?tab=households`, `?tab=residents` and `?tab=personnel`. The Users heading, summary cards and tab bar stay mounted. The existing registry tools render as panels below the tabs; personnel/resident account changes refresh the shared counts. Old `/admin/households`, `/admin/residents` and `/admin/personnel` bookmarks redirect to the corresponding tab. Refresh and browser Back restore the selected tab. Pending/rejected registrations are excluded from legacy account lists to prevent treating them as approved residents.
- Summary cards and tab counts cover every authorized account, irrespective of filters. The current system is a single-barangay application with global administrator access, not a multi-organization model.
- Added this month uses `APP_TIMEZONE`; month boundaries are converted to `DB_TIME_ZONE` for database comparison. Last login is the latest successful `login_history` entry, with never-logged-in accounts placed last in either direction.
- Search covers names, emails, and all linked household puroks/addresses. Tabs, role and status filters intersect. Sorting always includes a user-ID tie breaker. Paging is server-side and clamps after mutations.
- Selection is limited to approved accounts on the current page and clears on query/page changes and refresh. Your own account cannot be selected for bulk status changes. Bulk actions execute separately checked requests, show successful counts and identify each failed account without rolling back successful ones. Registration requests are reviewed individually.
- Export without selection includes **every matching account across all pages**. With selection, it includes matching selected IDs only. CSV fields are quoted through `fputcsv`; potential spreadsheet formulas are prefixed with an apostrophe. Passwords, hashes, version values and login IPs are never exported.
- Add user provisions an immediately active account through the existing password-hashing mechanism. Edit supports name, email, contact and role. Role changes and activation changes require confirmation. Details show the listed account snapshot; stale writes require refreshing and reopening it.
- Access is derived from the existing three roles, not a second permission system. Residents retain own-household scope; relief personnel retain their existing reporting/distribution permissions.

Public registration creates a pending resident request. The form confirms that approval is required and does not automatically open sign-in. Pending and rejected accounts cannot log in or use an existing session. Approval allows resident access; rejection retains the record under Rejected. Both decisions require confirmation, administrator authorization, an unchanged version and a pending request. Decisions record reviewer/time and audit entries. Activation and profile/role edits cannot bypass review. Correct-password attempts awaiting approval are audited but do not count toward password lockout; incorrect passwords still do.

The project has no password recovery service. No recovery control or permanent-delete action is exposed on Users; the existing legacy delete endpoint retains its history checks and participates in administrator locking.

## Registration migration

Run `database/migration_phase26_registration_requests.sql` against the selected application database, including after fresh imports from older schema snapshots. It creates `user_registration_requests` with a user foreign key, status, request time, review time and reviewer. It is repeatable and does not update existing users. No request row means an existing or administrator-created account is approved; `users.is_active` remains independent.

The local-only CLI helper is `php database/apply_registration_migration.php`. It refuses non-local environments/hosts. It was applied to the configured local development database on 17 October 2026; all **12 existing accounts were preserved**. No production migration was run. Before migration, existing sign-in continues working, while new registration fails closed with HTTP 503 instead of silently bypassing approval.

## Implementation

- `frontend/src/pages/admin/AdminUsers.jsx`: server-driven directory, forms, confirmations, details, export, bulk results and retry states.
- `frontend/src/components/users/`: shared masterlist navigation, native accessible dialog and scoped responsive styling.
- `backend/users/management.php`: field validation, account versions, actor/self/last-admin checks, CSV safety and transaction helpers.
- `backend/users/list_managed.php`: managed listing/export, summaries and pagination; authenticated both directly and through `get_users.php`.
- `backend/users/registration.php`, `review_registration.php`: approval lookup, transactional review and audit. `backend/auth/register.php`, `login.php`, `session.php` and `backend/config/cors.php` enforce the approval state.
- `backend/users/add_user.php`, `update_user.php`, `toggle_status.php`: transactional changes and audit logging. The existing `require_login` mechanism rechecks account activation and role on every protected request.

All account-administration mutations acquire ordered administrator-row locks, then recheck the actor before locking the target. Losing concurrent administrators cannot continue changing accounts. Changes and audit entries commit together. Email uniqueness remains enforced by the existing case-insensitive database key, with trimming and validation matching existing registration semantics.

`get_users.php?managed=1` opts into paging and extra metadata. The original unpaged array contract remains intact, with an additive `version` field. Current Users, Personnel and Residents screens submit account versions for mutations. Versions remain optional at the legacy API boundary for existing clients; those older clients retain last-write-wins semantics until upgraded. A version is a hash of public editable fields and activation, not an authentication token.

## Verification — 17 October 2026

Executed from the repository root unless noted:

```powershell
& C:\xampp\php\php.exe tests/user_management_unit_test.php
node tests/user_management_integration_test.mjs
node tests/registration_requests_test.mjs
node tests/registration_migration_test.mjs
node tests/user_management_browser_test.mjs
node tests/user_management_tabs_test.mjs
node tests/auth_logic_test.mjs
node tests/local_date_test.mjs
& C:\xampp\php\php.exe tests/cors_dev_origins_test.php
Get-ChildItem backend/users/*.php | ForEach-Object { & C:\xampp\php\php.exe -l $_.FullName }
git diff --check
# In frontend:
npm run build
```

Results:

- Account validation/policy unit tests: **24 passed**.
- HTTP integration tests against a new isolated MySQL database: **56 passed**. Covers unauthorized list/inspect/mutation/export, input injection, duplicate accounts, edit persistence, stale cross-screen edits, activation/login/session behavior, registration approval, role escalation prevention, filters, paging, safe full/selected CSV, methods, and two simultaneous administrator deactivations on independent PHP servers.
- Approval-specific API tests: **26 passed**, including approval/rejection transitions, stale and duplicate decisions, privilege injection, pending sessions, audit logs and credential throttling. Migration rehearsal passed before/after compatibility and repeatability checks.
- Real-data Chrome browser tests: **19 passed**. Includes public registration, blocked pre-approval sign-in, approval enabling sign-in, rejection persistence, create/edit persistence after refresh, bulk confirmation, deactivated tab, CSV download, Escape close, desktop/tablet/mobile layout, contained table scrolling, mobile dialog fit and no JavaScript errors. Screenshots inspected at desktop and mobile sizes.
- Tab consolidation browser checks: **24 passed**, covering all three embedded registries with real data, retained Users header and counts, active sidebar state, personnel creation and count refresh, refresh/Back behavior, legacy bookmarks, mobile overflow and keeping the selected tab visible after mobile refresh. The regression test first reproduced the old page-navigation behavior before the change.
- Auth logic: **39 passed**. Earlier unchanged local-date checks: **4 passed**; CORS: **41 passed**.
- User/authentication PHP syntax checks and `git diff --check` passed.
- Production build passed. Vite reports a bundle over 500 kB; bundle splitting was not part of this feature.

The first browser run identified password help text being included in the field's accessible name; the label/help association was corrected and subsequent runs passed. The first CORS run could not reach localhost inside the sandbox (2/41); rerunning with local network access passed 41/41. The approval suite first reproduced immediate access before implementation, and subsequently reproduced a pending-check/password-lockout interaction identified by code review; both were corrected and verified. These were resolved verification failures, not outstanding failures.

`tests/run_all.sh` was deliberately not run: it drops/recreates application databases and depends on a separate Linux test environment. The full unrelated system suite and production deployment have not been verified. The supplied attachment had no screenshot, so layout follows the written requirements and existing design system.

## Test setup and retained artifacts

The integration fixture creates a uniquely named `codex_users_test_*` database using the repository schema and synthetic accounts, without resetting or writing to application accounts. Test databases are retained for inspection; no cleanup/drop is performed. The initial user-management runs created:

- `codex_users_test_20261017_080816_6c98ad`
- `codex_users_test_20261017_081054_db3067`

Approval development/rehearsal created further `codex_users_test_*` databases with the same isolation. Their exact names are printed by the corresponding tests.

Random test credentials and browser screenshots are in ignored `tests/.user-management-local/`. Run the integration test before the browser test. Test PHP/Vite servers terminate after each test. The scripts support `PHP_BIN`, `DB_USER` and `DB_PASS`; the browser test supports `PLAYWRIGHT_PATH` and uses an installed Chrome browser. Its default package path reflects the local bundled runtime and can be overridden on another machine.

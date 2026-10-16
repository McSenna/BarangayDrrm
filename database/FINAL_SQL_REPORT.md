# Final Database SQL Report

**File:** `database/barangay_disaster_db_FINAL.sql`
**System:** Web-Based Post Disaster Monitoring and Relief Allocation with Decision Support System for Barangay Binitayan
**Prepared:** 30 September 2026. Every result below comes from tests actually run, as described in sections 11 and 12.

## How the file was built

The final file was consolidated from the project's own database files, not designed from scratch.

1. **Sources.**
   - `barangay_disaster_db_complete.sql` is the Phase 17 consolidation, which already includes Phase 18.
   - `migration_phase18_recommendation_rejections.sql` defines the recommendation rejection table.
2. **Migration cross-check.**
   - The older base file `barangay_disaster_db.sql` was imported, then every migration file was applied in order (phases 1–4, 6–10, 13, 14, 16 and 18).
   - The resulting schema was compared with the consolidated schema table by table and line by line.
   - The table list, columns, keys and foreign keys match, with one difference: `disaster_reports.disaster_type` has `DEFAULT 'Other'` in the migration chain and no default in the consolidated file.
   - The final file keeps the consolidated version (no default). Every insert, in `create_report.php`, supplies a validated disaster type.
3. **Changes made for production and Hostinger:**
   - Removed `CREATE DATABASE` and `USE`, and the MariaDB-only `/*M!999999\- enable the sandbox mode */` line, which can break imports into MySQL/phpMyAdmin.
   - Removed the optional sample relief items. These were starter stock, not required configuration.
   - Tables are ordered by foreign-key dependency. The file also imports successfully with `FOREIGN_KEY_CHECKS = 1`.
   - There are no `DROP`, `GRANT` or `DEFINER` statements, no triggers, views or procedures, and no hard-coded database name.

## 1. Final table count

**25 tables, 197 columns, 42 foreign keys and 76 indexes.** The 76 indexes are made up of 25 primary keys, 8 unique keys and 43 regular indexes.

## 2. Complete table list (in import order)

| # | Table | Purpose |
|---|---|---|
| 1 | disaster_types | Configurable disaster types (Disaster Settings) |
| 2 | inventory_categories | Configurable relief item categories (Inventory Settings) |
| 3 | relief_items | Relief inventory: stock, unit, minimum (low-stock) level, expiration |
| 4 | users | Accounts for the admin, resident and relief_personnel roles |
| 5 | audit_logs | Audit trail of user actions |
| 6 | donations | Donations received (added to stock) |
| 7 | hazard_alerts | Hazard alerts |
| 8 | households | Household profiles, vulnerability counts, coordinates |
| 9 | disaster_reports | Resident disaster reports (type, severity, status, verification) |
| 10 | damage_assessments | One damage assessment per report |
| 11 | household_members | Members of each household |
| 12 | inventory_logs | Stock In / Stock Out / Adjustment / Donation history |
| 13 | login_history | Login and logout history, including failed attempts |
| 14 | relief_packages | Named relief bundles for distribution schedules |
| 15 | distribution_schedules | Scheduled distributions (package, date, location, personnel) |
| 16 | distribution_beneficiaries | Households on a schedule and their delivery status |
| 17 | delivery_reports | Proof of delivery (recipient, remarks) |
| 18 | delivery_report_photos | Photos attached to delivery reports |
| 19 | relief_allocations | Relief allocations: Pending → Approved → Distributed |
| 20 | relief_package_items | Items and quantities in each package |
| 21 | relief_recommendation_rejections | Phase 18: Administrator rejections of computed recommendations |
| 22 | report_photos | Photos attached to disaster reports |
| 23 | sms_logs | Administrator-initiated SMS history and status |
| 24 | system_settings | Key–value settings (contact details, inventory defaults) |
| 25 | weather_logs | Manual and API weather observations |

Two of the names in the request differ from the actual project:
- Disaster report photos are stored in **`report_photos`**; there is no `disaster_photos` table.
- Package contents are stored in **`relief_package_items`**; there is no `package_items` table.

No other table names are used by the backend.

## 3. Important relationships

| Relationship | Rule on delete of the parent |
|---|---|
| households → household_members | CASCADE (members are part of the household record) |
| households → disaster_reports.household_id | SET NULL (reports are kept, unlinked) |
| users → disaster_reports.user_id | CASCADE (existing rule; see Limitations) |
| disaster_reports → report_photos | CASCADE |
| disaster_reports → damage_assessments | CASCADE (one assessment per report, UNIQUE report_id) |
| disaster_types.type_name → disaster_reports.disaster_type | RESTRICT, ON UPDATE CASCADE (renaming a type renames it on reports) |
| inventory_categories.category_name → relief_items.category | RESTRICT, ON UPDATE CASCADE |
| households → relief_allocations | RESTRICT (a household with relief history cannot be deleted) |
| relief_items → relief_allocations / inventory_logs / donations / relief_package_items | RESTRICT (an item with history cannot be deleted) |
| households → distribution_beneficiaries | RESTRICT |
| distribution_schedules → distribution_beneficiaries | CASCADE (the application blocks deleting a schedule that has deliveries) |
| distribution_beneficiaries → delivery_reports → delivery_report_photos | CASCADE |
| distribution_schedules → relief_allocations.schedule_id | SET NULL |
| relief_packages → distribution_schedules | RESTRICT (default rule) |
| relief_packages → relief_package_items | CASCADE |
| households / relief_items → relief_recommendation_rejections | CASCADE (a rejection has no meaning without its household or item) |
| users → audit_logs, login_history, sms_logs, inventory_logs, allocations (approved_by, distributed_by), alerts, weather, settings, rejections | SET NULL (history is kept; only the user link is cleared) |

## 4. Important indexes

- **Unique keys:**
  - `users.email`
  - `disaster_types.type_name`
  - `inventory_categories.category_name`
  - `damage_assessments.report_id`
  - `delivery_reports.beneficiary_id`
  - `distribution_beneficiaries (schedule_id, household_id)`
  - `relief_package_items (package_id, item_id)`
  - `relief_recommendation_rejections (household_id, item_id)`
- **Performance indexes used by the DSS and lists:**
  - `disaster_reports.status`, `disaster_reports.severity`
  - `relief_allocations.status`
  - `distribution_beneficiaries.status`
  - `hazard_alerts.is_active`
  - `households.purok`
- Every foreign key column is indexed.
- A check for two indexes on the same columns in the same table found none.

## 5. Foreign key behavior

The 42 foreign keys break down as follows:
- **9 RESTRICT:** they protect relief, inventory, donation, package and distribution history, and the type and category lookups.
- **23 SET NULL:** they keep history when a user or household link is removed.
- **10 CASCADE:** these apply only to child detail rows (members, photos, assessments, package items, beneficiaries/deliveries under a schedule, and recommendation rejections), plus the existing `disaster_reports.user_id` rule.

No new CASCADE rule touches relief, inventory, SMS or audit history. The only CASCADE added for Phase 18 is on the rejection table, which stores no history.

## 6. Configuration tables and default records

These are the only rows the file inserts, and all of them are marked "DEFAULT RECORDS" in the SQL:

- **`system_settings`** (9 rows):
  - barangay_name, system_name, barangay_address, office_hours, contact_email, contact_phone and emergency_hotline. These are used by the navigation bar, the footers and the public Contact page.
  - default_minimum_level and default_unit. These are used by the Add Relief Item form.
- **`inventory_categories`** (6 rows): Food, Water, Hygiene, Medical, Shelter, Other. The DSS relief-need rules match on these names.
- **`disaster_types`** (6 rows): Flood, Typhoon, Landslide, Earthquake, Fire, Other.

The seeded contact email (`admin@binitayan.gov.ph`) and phone (`09171234567`) are placeholders. Replace them in System Settings before going live.

## 7. DSS-related tables

These are read by `priority_list.php` and `relief_recommendations.php`. The DSS algorithm was not changed.

- **`disaster_reports`:** severity and status of the household's highest-severity report that is not Rejected.
- **`households`:** `number_of_members` and `vulnerable_members` (the total of the six vulnerability counts), plus `purok` for the location factor.
- **`damage_assessments`:** `house_damage`, `infrastructure_damage`, `property_damage` and `agricultural_damage`. `estimated_severity` is stored and displayed but is **not** used in the score.
- **`hazard_alerts`:** `is_active` and `affected_purok`.
- **`relief_allocations`:** status, used for the relief-history factor. The sum of Approved quantities is the committed stock.
- **`relief_items`:** quantity and category, used for estimated needs, availability and shortage.
- **`relief_recommendation_rejections`:** pairs the Administrator rejected. They are skipped when recommendations are computed.

No scoring columns were added. The score is always computed and never stored.

## 8. Inventory and relief tables

- `relief_items` holds stock, unit and `minimum_level`.
- `inventory_categories` holds the categories.
- `inventory_logs` records every stock movement.
- `donations` records donations received.
- `relief_allocations` records the status, the approved quantity (`quantity`), who approved it and when, and who distributed it and when.
- Scheduled deliveries use `relief_packages`, `relief_package_items`, `distribution_schedules`, `distribution_beneficiaries`, `delivery_reports` and `delivery_report_photos`.

## 9. SMS and audit tables

- **`sms_logs`:**
  - `recipient_type`: Resident, Relief Personnel, Household or Custom.
  - `recipient_name`, `recipient_number`, `message`.
  - `category`: 8 values.
  - `status`: Sent, Failed or Not Configured.
  - `error_message`, `sent_by`, `sent_at`.
  - These columns match `sms/sms_helper.php` and `sms/get_logs.php`. There is no automatic-SMS or debug table.
- **`audit_logs`:** log_id, user_id, action, details, created_at. Matches `log_action()` and `audit/get_logs.php`.
- **`login_history`:** history_id, user_id, email_attempted, login_status, failure_reason, login_at, logout_at, ip_address. Matches `auth/login.php`, `auth/logout.php` and `audit/get_login_history.php`.

## 10. Phase 18 table

`relief_recommendation_rejections` has these columns and keys, identical to `migration_phase18_recommendation_rejections.sql`:

- **Columns:**
  - rejection_id (primary key)
  - household_id
  - item_id
  - reason (varchar 255, nullable)
  - rejected_by (nullable)
  - rejected_at (defaults to the current time)
- **Keys:**
  - UNIQUE (household_id, item_id)
  - Foreign keys to households (CASCADE), relief_items (CASCADE) and users (SET NULL)

It is used by `relief/reject_recommendation.php` (insert, or update on duplicate), `relief/restore_recommendation.php` (delete), and `dashboard/relief_recommendations.php` (read, and returns `rejected` to `ReliefRecommendations.jsx`).

## 11. Fresh database import test result

Tested on MariaDB 10.11.14. MySQL 8 was not available for testing.

| Test | Result |
|---|---|
| Import into a new EMPTY database with a different name (`final_import_test`), strict SQL mode (`STRICT_TRANS_TABLES, STRICT_ALL_TABLES, NO_ZERO_IN_DATE, NO_ZERO_DATE, ERROR_FOR_DIVISION_BY_ZERO`) | **PASS**: no errors, no warnings |
| Import with `FOREIGN_KEY_CHECKS = 1` forced (proves the dependency order) | **PASS** |
| `SHOW TABLES` | 25 tables, all required by the backend |
| Foreign keys referencing a missing table | 0 |
| Duplicate tables / columns / constraints | None (import would fail otherwise) |
| Duplicate indexes on the same columns | 0 |
| Rows other than the default records (users, households, items, reports, allocations, SMS, audit) | 0 |
| Phase 18 migration run twice on an existing database | **PASS** (idempotent) |

## 12. Backend compatibility test result

| Check | Result |
|---|---|
| Static scan of all 106 backend PHP files: every table named after FROM, JOIN, INTO or UPDATE, every `alias.column`, every INSERT column list, every UPDATE SET column, and single-table WHERE columns, checked against the imported schema | **PASS**: 331 table references and 977 column references, 0 mismatches. The scanner was confirmed to catch a planted bad table, bad column and bad alias. |
| Full API regression test (131 checks: authentication, authorization, households and members, reports and photos, damage assessment, priority list, recommendations and scarcity, approval, distribution, scheduled deliveries, inventory, settings, profile, audit, SMS) against a database imported from the FINAL file | **PASS**: 131/131. Test-only starter items were inserted after import; they are not in the FINAL file. |
| Phase 18 feature test (rejected-report scoring, rejection persistence and restore, reserved stock versus Stock Out/Adjust, dynamic disaster types, settings, SMS without the debug endpoint) against the FINAL database | **PASS**: 45/45 |
| PHP syntax check (all 106 backend files) | **PASS** |
| Frontend production build (`vite build`) | **PASS** |

The first run of the 131-check suite reported 8 failures. None were schema problems. They were expectations written before recent intended changes:
- the table count is now 25 instead of 24;
- several messages were reworded;
- "in use" deletions return 409 instead of 400;
- one test assumed the household search endpoint also searches member names. It never did, and the code is unchanged; member-name search happens on the map page.

The expectations were updated and the suite was re-run: 131/131. No application code was changed for this task.

## 13. Remaining database limitations

1. **Deleting a user deletes that user's disaster reports.** `disaster_reports.user_id` is ON DELETE CASCADE, an existing Phase 16/17 rule kept unchanged. In the current UI only Administrator accounts can be deleted, and administrators do not submit disaster reports, so the UI cannot trigger it. Changing it to SET NULL would need `user_id` to become nullable and report queries to handle a missing resident, which is an application change, so it was not made.
2. **No relief items are pre-loaded.** After import, add real stock through Inventory. The development-only script `backend/setup_demo_data.php` expects starter items and should not be run on the production database.
3. **Not tested on MySQL 8.** The file was tested on MariaDB 10.11, the engine Hostinger normally provides. It uses standard syntax only (InnoDB, utf8mb4_general_ci, `current_timestamp()` defaults). MySQL 8 may show deprecation warnings for `int(11)` display widths; these are warnings, not errors.
4. **Fresh installs only.** The file is for an empty database. A database that already has these tables should be upgraded with the migration files (currently only Phase 18) instead.
5. **Placeholder contact details.** The seeded `contact_email` and `contact_phone` should be replaced in System Settings.

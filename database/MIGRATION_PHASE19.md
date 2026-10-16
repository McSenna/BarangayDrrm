# Phase 19 Database Migration — Capstone Redesign

**File:** `database/migration_phase19_redesign.sql`
**Fresh installs:** import `database/barangay_disaster_db_FINAL.sql` instead (Phase 19 already included).

## Safety

- Additive only. There are no `DROP`, `DELETE` or `TRUNCATE` statements, and no existing data is rewritten.
- New tables use `CREATE TABLE IF NOT EXISTS`. New columns and indexes use `ADD … IF NOT EXISTS`. The one new foreign key on an existing table is guarded with an `information_schema` check.
- Safe to run more than once. Tested: two consecutive runs on a database with demo data, with no errors and no data changes.
- `sms_logs.category` is widened. All 8 existing values keep their order and 5 values are appended, so existing rows are unaffected.
- Uses MariaDB syntax (`ADD COLUMN IF NOT EXISTS`). XAMPP and Hostinger both run MariaDB. Tested on MariaDB 10.11.

## How to run on an existing database

1. Back up the database (phpMyAdmin → Export).
2. phpMyAdmin → select `barangay_disaster_db` → Import → `migration_phase19_redesign.sql` → Go.
   Or from a shell: `mysql -u root barangay_disaster_db < database/migration_phase19_redesign.sql`.
3. No data step is needed. Older non-standard purok values (for example `3` or `Demo-3`) are **not** changed automatically. Map them in **Admin → Settings → Purok Cleanup**.

## New tables (6)

| Table | Purpose | Key relationships |
|---|---|---|
| `relief_requests` | A resident's request for relief for their household. Status: Pending, Under Review, Approved, Partially Approved, Rejected, Allocated, Distributed | `household_id` → households (RESTRICT); `user_id`, `reviewed_by`, `processed_by` → users (SET NULL); `report_id` → disaster_reports (SET NULL) |
| `relief_request_items` | Requested item and quantity, plus the Administrator's approved quantity | `request_id` → relief_requests (CASCADE); `item_id` → relief_items (RESTRICT); UNIQUE (request_id, item_id); CHECK requested > 0 |
| `evacuation_centers` | Name, address, purok, coordinates, capacity, current occupancy, facilities, contact, status (Open / Closed / Full) | `created_by`, `updated_by` → users (SET NULL); CHECK 0 ≤ occupancy ≤ capacity |
| `evacuation_center_logs` | History of occupancy and status changes | `center_id` → evacuation_centers (CASCADE); `changed_by` → users |
| `relief_feedback` | Resident feedback on one delivered record | `household_id` → households; exactly one of `beneficiary_id` / `request_id` / `allocation_id` (CHECK), each UNIQUE (one feedback per delivery); rating CHECK 1–5 |
| `notifications` | In-app notifications | `user_id` → users (CASCADE); UNIQUE (user_id, event_key) prevents duplicates |

## Changed tables (3)

| Table | Change | Why |
|---|---|---|
| `relief_allocations` | + `request_item_id` (nullable), index, FK → relief_request_items (SET NULL) | Traces an allocation back to the request line it fulfils. NULL for manual and DSS-only allocations. |
| `distribution_schedules` | + `latitude`, `longitude` (nullable decimal(10,7)) | Distribution sites on the map, validated against the Binitayan boundary |
| `sms_logs` | + `event_key` (nullable), UNIQUE (`event_key`, `recipient_number`); `category` ENUM + 5 values | Duplicate protection for automatic SMS. Manual SMS has `event_key` NULL and is never restricted. |

## Totals

| | Before (Phase 18) | After (Phase 19) |
|---|---|---|
| Tables | 25 | 31 |
| Foreign keys | 42 | 60 |

## Verification performed

- The regenerated `barangay_disaster_db_FINAL.sql` was compared with *Phase 18 FINAL + this migration* using `information_schema`: every column (type, nullability, default, position), index, foreign key (delete/update rule) and CHECK constraint. Result: identical.
- A fresh install from `barangay_disaster_db_FINAL.sql`, then `setup_admin.php` and `setup_demo_data.php`, passed the full API test suite (99/99). See `TESTING_SUMMARY.md`.

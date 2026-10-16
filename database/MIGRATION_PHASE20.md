# Phase 20 Database Migration — Panel-Requested Automation

**File:** `database/migration_phase20_automation.sql`
**Fresh installs:** import `database/barangay_disaster_db_FINAL.sql`, which already includes Phase 20 (33 tables).

## Safety
- **Additive only.** No DROP, DELETE or TRUNCATE, and no data is rewritten.
- New tables use `CREATE TABLE IF NOT EXISTS`; new columns and indexes use `ADD … IF NOT EXISTS`.
- New foreign keys on `sms_logs` are guarded with an `information_schema` check.
- `sms_logs.category` is widened: the 13 existing values keep their order and 1 value is appended.
- Safe to run more than once. Tested twice in a row on a fresh database.
- After the migration, the structure was compared with `barangay_disaster_db_FINAL.sql` (columns, defaults and foreign keys): identical.
- The DSS tables and columns are not touched.

## How to run on an existing database (XAMPP or Hostinger)
1. **Back up the database:** phpMyAdmin → Export.
2. **Import the migration:** phpMyAdmin → select the database → Import → `migration_phase20_automation.sql` → Go.
3. **Upload the new files:** the Phase 20 backend files and the rebuilt frontend (see `PHASE20_TEST_REPORT.md`, "Files changed").

If the code is uploaded **before** the migration:
- SMS keeps working, because logging falls back to the Phase 19 columns.
- The new Events, Affected Areas and Situation Report pages show: *"This feature needs the Phase 20 database update. Please run database/migration_phase20_automation.sql."*

## What it adds

| Structure | Purpose |
|---|---|
| `disaster_events` | Named disaster/event: name (unique), disaster type (FK to `disaster_types`, ON UPDATE CASCADE), start and end date (CHECK end ≥ start), description, status Active / Closed, created_by |
| `disaster_affected_areas` | Administrator-recorded area: event (FK RESTRICT), hazard type, name, description / source, validated GeoJSON, vertex_count, status Active / Resolved, created / updated by and at, resolved_at |
| `sms_logs` + `event_type`, `household_id`, `allocation_id`, `request_id`, `provider_response`, `attempts`, `last_attempt_at` | Automated-SMS details and safe retry. The three ID columns are FKs with ON DELETE SET NULL. |
| `sms_logs.category` + `'Relief Allocation Update'` | Category for the allocation-approved SMS |

# Phase 23 Database Migration — Six Core Modules

**File:** `database/migration_phase23_core_modules.sql`
**Fresh installs:** import `database/barangay_disaster_db_FINAL.sql` instead. Phase 23 is already included in it.

## Safety

- The migration only adds things. It has no `DROP`, `DELETE`, `TRUNCATE` or data rewrite.
- No table was removed in Phase 23. Pages left the navigation, but their tables and data stay.
- Safe to run more than once. It uses `ADD COLUMN IF NOT EXISTS`, and the CHECK constraint is added only when it is missing (checked through `information_schema`).
- Existing rows keep their values:
  - The new report columns start as NULL.
  - Every existing affected area becomes a `Recorded Affected Area`, which is its Phase 20 meaning.
- Run it after the Phase 20 and Phase 21 migrations. It was tested on MariaDB 10.11, which is the database XAMPP uses.

## How to run on an existing database

1. Back up the database (phpMyAdmin → Export).
2. In phpMyAdmin, select `barangay_disaster_db` → Import → `migration_phase23_core_modules.sql` → Go.
   From a shell, run: `mysql -u root barangay_disaster_db < database/migration_phase23_core_modules.sql`.
3. No data step is needed.

## Changes

| Table | Change | Used by |
|---|---|---|
| `disaster_reports` | `latitude`, `longitude` DECIMAL(10,7) NULL | Automation of Reporting and Map: optional incident location. The server refuses a point outside Barangay Binitayan. Without it, the map uses the household's saved location. |
| `disaster_reports` | `reported_needs` VARCHAR(100) NULL | Automation of Reporting and Hazard Monitoring: immediate needs as comma-separated values from Food, Water, Hygiene, Shelter, Medical, Clothing, Other. |
| `disaster_affected_areas` | `area_type` ENUM('Recorded Affected Area','Flood-Prone Zone') NOT NULL DEFAULT 'Recorded Affected Area' | Map: separates areas actually affected in a disaster event from reference flood-prone zones. A flood-prone zone does **not** mean active flooding. |
| `disaster_affected_areas` | `event_id` becomes NULL-able. The foreign key is unchanged. | Lets a flood-prone zone exist without a disaster event. |
| `disaster_affected_areas` | `CHECK chk_affected_area_event (area_type <> 'Recorded Affected Area' OR event_id IS NOT NULL)` | Makes sure every recorded affected area is still linked to its event. |

The reference number (`RPT-<year>-<5-digit id>`) is **derived** from `report_id` and `created_at`. It is not stored, so it can never go out of sync with the record and needs no new column.

## Code still works before the migration

If the migration has not been run yet, the backend checks for the new columns and carries on without them:
- Reports are saved without coordinates or needs.
- Flood-prone zones are refused with a clear message that names the migration file.

## Verified

The checks below were run on a test copy and on the local databases.

- Running the migration twice gives no error.
- Running it on a database built from the Phase 22 `FINAL.sql` gives the same schema as the Phase 23 `FINAL.sql`.
- Row counts of every table are unchanged.
- The database refuses an INSERT of a `Recorded Affected Area` with a NULL `event_id` (the CHECK). Test `tests/phase23_core_modules_test.py` A5 covers this.

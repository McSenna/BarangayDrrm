# Phase 21 Database Migration — Ready for Distribution

**File:** `database/migration_phase21_resident_scope.sql` (run **after** Phase 20)
**Fresh installs:** `database/barangay_disaster_db_FINAL.sql` already includes Phase 21 (still 33 tables).

## Safety
- **Additive only:** no DROP, DELETE or TRUNCATE, and no data is rewritten. Existing allocations keep their status; the new columns are NULL.
- Columns and indexes use `ADD … IF NOT EXISTS`. The foreign key and the CHECK are added only if missing (an `information_schema` check).
- **Safe to run more than once.** Tested twice in a row on a copy of a Phase 20 database. Afterwards, the `relief_allocations` columns, constraints and indexes were identical to a fresh `barangay_disaster_db_FINAL.sql`.
- The DSS is not touched.

## What it adds (`relief_allocations`)

| Column / constraint | Purpose |
|---|---|
| `ready_at`, `ready_by` (FK → `users`, ON DELETE SET NULL) | When and by whom the allocation was marked Ready for Distribution |
| `ready_schedule_date`, `ready_schedule_time` | Verified distribution date and optional time |
| `ready_location`, `ready_instructions` | Verified location and optional instructions (sent in the SMS) |
| `idx_relief_allocations_ready`, `idx_relief_allocations_ready_by` | Indexes |
| `chk_relief_allocations_ready` | A ready row must have a date and a non-empty location |

## How to run (XAMPP or Hostinger)
1. **Back up the database:** phpMyAdmin → Export.
2. **Import the migration:** phpMyAdmin → select the database → Import → `migration_phase21_resident_scope.sql` → Go. Run the Phase 20 migration first if it has not been run yet.
3. **Upload the new files:** the backend files and the rebuilt frontend `dist`.

If the code is uploaded before the migration:
- everything else works;
- **Mark Ready for Distribution** answers *"Ready for Distribution needs the Phase 21 database update…"* (503);
- the situation report shows the ready count as "Not available in recorded data".

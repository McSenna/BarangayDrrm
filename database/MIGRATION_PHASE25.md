# Phase 25 Database Migration — Official-Led Assessment, DSS Accountability, Allocation Corrections

**File:** `database/migration_phase25_official_assessment_dss_allocation.sql`
**Fresh installs:** import `database/barangay_disaster_db_FINAL.sql` (Phase 25 included) or the one-file demo `database/barangay_disaster_db_COMPLETE_PHASE25.sql`.

## Safety

- **Additive only.** No `DROP TABLE`, `DROP DATABASE`, `DELETE`, `TRUNCATE` or data rewrite. The only `DROP` is `DROP PROCEDURE IF EXISTS phase25_add_constraint`. That is the migration's own temporary helper procedure; it is created at the start and removed at the end.
- **ENUMs are only extended.** New values are appended:
  - `relief_allocations.status` adds `Cancelled`;
  - `sms_logs.status` adds `Queued`, `Accepted by Gateway` and `Delivered`.
  - Existing values and rows are unchanged. Legacy `Sent` rows stay `Sent`, and the UI shows them as "Accepted by gateway (legacy)".
- **New columns are NULL or default.** Existing allocations get `is_emergency_override = 0` and no DSS snapshot. A snapshot is not invented for approvals made before Phase 25.
- **Constraints are added only when missing.** Each foreign key and CHECK goes through `information_schema`. The two defensive CHECKs (`relief_items.quantity >= 0`, `relief_allocations.quantity > 0`) are added **only when no existing row violates them**, so the migration never fails on, or changes, existing data.
- **Re-runnable.** It was run twice on the synthetic defense dataset with no errors. After migration, the schema matched the new `barangay_disaster_db_FINAL.sql` exactly (`information_schema` column/constraint comparison).
- **Order and engine.** Run it after the Phase 20, 21 and 23 migrations. It was tested on MariaDB 10.11 (the XAMPP engine).

## How to run on an existing database

1. **Back up first:** phpMyAdmin → Export (Quick, SQL). Keep the file.
2. Run the migration. Either:
   - phpMyAdmin: select `barangay_disaster_db` → Import → `migration_phase25_official_assessment_dss_allocation.sql` → Go; or
   - shell: `mysql -u root barangay_disaster_db < database/migration_phase25_official_assessment_dss_allocation.sql`.
3. No data step is needed. Then deploy the Phase 25 backend and frontend.

## Changes

| Table | Change | Purpose |
|---|---|---|
| `relief_allocations` | `status` + `Cancelled`; `cancelled_by` (FK users, SET NULL), `cancelled_at`, `cancel_reason`; CHECK: a cancellation needs a reason | Cancel an allocation and release its reserved stock without deleting the record (audit F-ALLOC-03) |
| `relief_allocations` | `received_quantity`, `distribution_remarks`; CHECK `0 <= received_quantity <= quantity` | Partial receipt. Only the quantity actually received is deducted from stock. |
| `relief_allocations` | `is_emergency_override`, `override_reason`; CHECK: an override needs a reason | Emergency override, labelled and audited (F-DSS-02) |
| `relief_allocations` | `dss_score`, `dss_category`, `dss_rank`, `dss_ratings` (JSON text), `dss_model_version` | DSS snapshot frozen at approval (F-DSS-04) |
| `relief_allocations` | `event_id` (FK disaster_events, SET NULL) | Optional link to the disaster event |
| `relief_items` | CHECK `quantity >= 0` (only if no row is negative) | Defensive |
| `disaster_reports` | `collection_method` ENUM(Field Visit, Paper Form, Interview, Barangay Records, Direct Entry) | Records how the official collected the information |
| `disaster_reports` | `paper_form_no` (UNIQUE when given), `field_assessor`, `displacement_status`, `event_id` (FK), `updated_at` | Paper-form encoding with duplicate protection; who assessed |
| `sms_logs` | `status` + `Queued`, `Accepted by Gateway`, `Delivered`; default `Queued`; `provider_message_id` | Honest SMS statuses (F-SMS-02/03) |

**Two dates are kept separately:**
- `disaster_reports.report_date`/`report_time` is the **original assessment date** written on the form;
- `created_at` is when the report was **encoded**.

## Code works before the migration

The Phase 25 backend checks for the new columns:
- Without them, reports save without the assessment fields.
- SMS logs use the legacy `Sent` status.
- Emergency override and cancellation return **503** with a message that names this migration file. Existing features keep working.

## Rollback

**Recommended: code-only rollback (no data loss).**
- Redeploy the Phase 24 code (git tag `backup-before-phase25`) and **leave the schema as it is**.
- The Phase 24 code ignores the new columns, which are all NULL or default.
- The Phase 24 code never writes the new ENUM values.

Effects on rows written while Phase 25 was running:
- `Cancelled` allocations are not counted as reserved by Phase 24, which is correct.
- `Accepted by Gateway` and `Queued` SMS rows remain visible in SMS Logs.

**Full schema rollback is not provided as a script on purpose.**
- It would remove columns that may already hold audit evidence: override reasons, DSS snapshots, cancellation reasons and received quantities.
- It would also have to shrink ENUMs that rows may already use.
- If the barangay still decides to remove Phase 25, restore the backup taken in step 1. That discards everything recorded after the migration.

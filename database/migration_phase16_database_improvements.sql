-- =========================================================
-- PHASE 16 MIGRATION — Database Audit Improvements
-- Run this in phpMyAdmin (SQL tab) against barangay_disaster_db
-- if you already imported the database from a previous phase.
-- (Skip this file if you're importing barangay_disaster_db.sql fresh
-- in the future, once that file is updated to include these changes —
-- as of this migration, barangay_disaster_db.sql has NOT yet been
-- edited; this migration is the only place these changes live.)
--
-- Based on the Phase 16 database audit. All changes here are additive
-- or behavior-only:
--   1. New indexes on columns already used in frequent WHERE/filter
--      queries — no data is changed, no table is locked for long.
--   2. Two new foreign keys that make the existing disaster_type/
--      category validation (already enforced in PHP) authoritative
--      at the database level too. Verified before writing this file:
--      both target columns (disaster_types.type_name,
--      inventory_categories.category_name) are VARCHAR(50)/
--      utf8mb4_general_ci with a UNIQUE index, and the live data has
--      zero rows that would violate either constraint.
--      ON UPDATE CASCADE is REQUIRED here, not optional:
--      backend/settings/categories/update_category.php and
--      backend/settings/disaster_types/update_type.php already rename
--      the parent row first and then manually propagate the rename to
--      relief_items.category / disaster_reports.disaster_type in the
--      same transaction. Without ON UPDATE CASCADE, that first UPDATE
--      (renaming the parent while children still reference the old
--      name) would itself be rejected by the new FK before the
--      existing rename-cascade code ever runs.
--   3. Six existing foreign keys changed from ON DELETE CASCADE to
--      ON DELETE RESTRICT, so deleting a relief item or a household
--      can no longer silently erase its allocation/inventory/donation/
--      delivery history. backend/inventory/delete_item.php and
--      backend/households/delete_household.php were updated alongside
--      this migration to check for that history up front and return a
--      clear message instead of letting the new constraint surface as
--      a raw database error.
--
-- No table is created or dropped by this migration. No existing row
-- is modified, and no household_members / report_photos /
-- damage_assessments / hazard_alerts / relief_packages /
-- relief_package_items / distribution_schedules / sms_logs table is
-- touched — the Phase 16 audit confirmed all of those already exist
-- and are in active use; this migration does not duplicate them.
-- =========================================================

USE barangay_disaster_db;

-- Before running Section 3 on a database you did not get from this
-- project's barangay_disaster_db.sql as-is, confirm the constraint
-- names below still match your database first:
--   SELECT TABLE_NAME, CONSTRAINT_NAME, COLUMN_NAME
--   FROM information_schema.KEY_COLUMN_USAGE
--   WHERE TABLE_SCHEMA = 'barangay_disaster_db'
--     AND REFERENCED_TABLE_NAME IS NOT NULL
--     AND TABLE_NAME IN ('relief_allocations','inventory_logs','donations',
--                         'relief_package_items','distribution_beneficiaries');
-- If a name differs, substitute it in the matching DROP FOREIGN KEY
-- statement below before running.

-- ---------------------------------------------------------
-- 1. RECOMMENDED INDEXES
-- Verified via SHOW INDEX before writing this file: none of these six
-- columns had any index (beyond the table's own primary key).
-- ---------------------------------------------------------
ALTER TABLE households
  ADD INDEX idx_households_purok (purok);

ALTER TABLE disaster_reports
  ADD INDEX idx_disaster_reports_status (status);

ALTER TABLE disaster_reports
  ADD INDEX idx_disaster_reports_severity (severity);

ALTER TABLE relief_allocations
  ADD INDEX idx_relief_allocations_status (status);

ALTER TABLE distribution_beneficiaries
  ADD INDEX idx_distribution_beneficiaries_status (status);

ALTER TABLE hazard_alerts
  ADD INDEX idx_hazard_alerts_is_active (is_active);

-- ---------------------------------------------------------
-- 2. DATABASE-LEVEL VALIDATION — lookup-table foreign keys
-- ---------------------------------------------------------
ALTER TABLE disaster_reports
  ADD CONSTRAINT fk_disaster_reports_disaster_type
  FOREIGN KEY (disaster_type) REFERENCES disaster_types(type_name)
  ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE relief_items
  ADD CONSTRAINT fk_relief_items_category
  FOREIGN KEY (category) REFERENCES inventory_categories(category_name)
  ON UPDATE CASCADE ON DELETE RESTRICT;

-- ---------------------------------------------------------
-- 3. PROTECT HISTORICAL RELIEF DATA — CASCADE -> RESTRICT
-- Each existing FK is dropped by its current (MySQL auto-generated)
-- constraint name — confirmed via information_schema.KEY_COLUMN_USAGE
-- before writing this file — and re-added under a clearer name with
-- ON DELETE RESTRICT instead of CASCADE. The referenced column and
-- table are unchanged; only the delete behavior changes.
--
-- NOT changed (left exactly as-is, intentionally):
--   relief_package_items.package_id -> relief_packages  (CASCADE)
--   household_members.household_id  -> households        (CASCADE)
--   report_photos / delivery_report_photos / damage_assessments, etc.
-- These CASCADEs are correct as-is: a package's line items, a
-- household's named members, or a report's own photos have no
-- independent meaning once their parent is gone. Only the six
-- FKs below — where a delete would erase separately meaningful
-- transaction/distribution history — are changed.
-- ---------------------------------------------------------

ALTER TABLE relief_allocations DROP FOREIGN KEY relief_allocations_ibfk_1;
ALTER TABLE relief_allocations
  ADD CONSTRAINT fk_relief_allocations_household
  FOREIGN KEY (household_id) REFERENCES households(household_id) ON DELETE RESTRICT;

ALTER TABLE relief_allocations DROP FOREIGN KEY relief_allocations_ibfk_2;
ALTER TABLE relief_allocations
  ADD CONSTRAINT fk_relief_allocations_item
  FOREIGN KEY (item_id) REFERENCES relief_items(item_id) ON DELETE RESTRICT;

ALTER TABLE inventory_logs DROP FOREIGN KEY inventory_logs_ibfk_1;
ALTER TABLE inventory_logs
  ADD CONSTRAINT fk_inventory_logs_item
  FOREIGN KEY (item_id) REFERENCES relief_items(item_id) ON DELETE RESTRICT;

ALTER TABLE donations DROP FOREIGN KEY donations_ibfk_1;
ALTER TABLE donations
  ADD CONSTRAINT fk_donations_item
  FOREIGN KEY (item_id) REFERENCES relief_items(item_id) ON DELETE RESTRICT;

ALTER TABLE relief_package_items DROP FOREIGN KEY relief_package_items_ibfk_2;
ALTER TABLE relief_package_items
  ADD CONSTRAINT fk_relief_package_items_item
  FOREIGN KEY (item_id) REFERENCES relief_items(item_id) ON DELETE RESTRICT;

ALTER TABLE distribution_beneficiaries DROP FOREIGN KEY distribution_beneficiaries_ibfk_2;
ALTER TABLE distribution_beneficiaries
  ADD CONSTRAINT fk_distribution_beneficiaries_household
  FOREIGN KEY (household_id) REFERENCES households(household_id) ON DELETE RESTRICT;

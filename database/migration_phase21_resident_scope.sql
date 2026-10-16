-- =========================================================
-- Phase 21 — Resident role correction and "Ready for Distribution"
--
-- Adds the Ready for Distribution stage to relief allocations:
--   Pending -> Approved -> (Ready for Distribution) -> Distributed
--
-- The stored status stays 'Approved' while an allocation is ready, so the
-- stock reservation (available = stock - Approved) and the DSS relief-status
-- factor work exactly as before. "Ready for Distribution" = an Approved
-- allocation whose ready_at is set, with the verified schedule and location
-- that authorized personnel confirmed. Those details are what the resident
-- sees and what the automated SMS contains.
--
-- SAFE / ADDITIVE ONLY:
--   * no DROP, no DELETE, no TRUNCATE, no data rewrite
--   * new columns / indexes use ADD ... IF NOT EXISTS (MariaDB 10.0.2+)
--   * the new foreign key and CHECK are added only if missing
--   * existing allocations keep their status; their new columns are NULL
--   * safe to run more than once
--
-- The DSS is NOT changed.
--
-- Run in phpMyAdmin on the existing database (Import tab), AFTER Phase 20:
--   mysql -u root barangay_disaster_db < database/migration_phase21_resident_scope.sql
-- Fresh installs: barangay_disaster_db_FINAL.sql already contains Phase 21.
-- =========================================================

SET FOREIGN_KEY_CHECKS = 1;

ALTER TABLE `relief_allocations`
  ADD COLUMN IF NOT EXISTS `ready_at` timestamp NULL DEFAULT NULL AFTER `approved_at`,
  ADD COLUMN IF NOT EXISTS `ready_by` int(11) DEFAULT NULL AFTER `ready_at`,
  ADD COLUMN IF NOT EXISTS `ready_schedule_date` date DEFAULT NULL AFTER `ready_by`,
  ADD COLUMN IF NOT EXISTS `ready_schedule_time` time DEFAULT NULL AFTER `ready_schedule_date`,
  ADD COLUMN IF NOT EXISTS `ready_location` varchar(255) DEFAULT NULL AFTER `ready_schedule_time`,
  ADD COLUMN IF NOT EXISTS `ready_instructions` varchar(300) DEFAULT NULL AFTER `ready_location`;

ALTER TABLE `relief_allocations`
  ADD INDEX IF NOT EXISTS `idx_relief_allocations_ready` (`ready_at`),
  ADD INDEX IF NOT EXISTS `idx_relief_allocations_ready_by` (`ready_by`);

SET @fk := (SELECT COUNT(*) FROM information_schema.REFERENTIAL_CONSTRAINTS
            WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = 'fk_relief_allocations_ready_by');
SET @sql := IF(@fk = 0,
  'ALTER TABLE `relief_allocations` ADD CONSTRAINT `fk_relief_allocations_ready_by` FOREIGN KEY (`ready_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- A ready allocation always has a confirmed date and location.
SET @ck := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
            WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'relief_allocations'
              AND CONSTRAINT_NAME = 'chk_relief_allocations_ready');
SET @sql := IF(@ck = 0,
  'ALTER TABLE `relief_allocations` ADD CONSTRAINT `chk_relief_allocations_ready` CHECK (`ready_at` IS NULL OR (`ready_schedule_date` IS NOT NULL AND `ready_location` IS NOT NULL AND `ready_location` <> ''''))',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

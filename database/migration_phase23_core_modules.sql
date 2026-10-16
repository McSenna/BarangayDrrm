-- =========================================================
-- Phase 23 — Six core modules (simplification)
--
-- 1. disaster_reports: optional incident coordinates and the immediate needs
--    recorded with the report (Automation of Reporting).
-- 2. disaster_affected_areas: area_type distinguishes a "Recorded Affected
--    Area" (an area actually affected in a disaster event — the Phase 20
--    meaning, unchanged for existing rows) from a "Flood-Prone Zone"
--    (reference geography, NOT active flooding). Flood-prone zones are not
--    tied to an event, so event_id becomes optional for them only; a CHECK
--    keeps every recorded affected area linked to its event.
--
-- SAFE / ADDITIVE ONLY: no DROP, no DELETE, no TRUNCATE, no data rewrite.
-- Existing rows keep their values (new columns are NULL / default). Safe to
-- run more than once. Run AFTER the Phase 20 and Phase 21 migrations.
-- No table was removed in Phase 23: pages left the navigation, data stays.
-- =========================================================

SET FOREIGN_KEY_CHECKS = 1;

ALTER TABLE `disaster_reports`
  ADD COLUMN IF NOT EXISTS `latitude` decimal(10,7) DEFAULT NULL AFTER `location`,
  ADD COLUMN IF NOT EXISTS `longitude` decimal(10,7) DEFAULT NULL AFTER `latitude`,
  ADD COLUMN IF NOT EXISTS `reported_needs` varchar(100) DEFAULT NULL AFTER `description`;

ALTER TABLE `disaster_affected_areas`
  ADD COLUMN IF NOT EXISTS `area_type` enum('Recorded Affected Area','Flood-Prone Zone') NOT NULL DEFAULT 'Recorded Affected Area' AFTER `event_id`;

-- event_id optional (only flood-prone zones may omit it); the FK is unchanged.
ALTER TABLE `disaster_affected_areas` MODIFY `event_id` int(11) DEFAULT NULL;

SET @ck := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
            WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'disaster_affected_areas'
              AND CONSTRAINT_NAME = 'chk_affected_area_event');
SET @sql := IF(@ck = 0,
  'ALTER TABLE `disaster_affected_areas` ADD CONSTRAINT `chk_affected_area_event` CHECK (`area_type` <> ''Recorded Affected Area'' OR `event_id` IS NOT NULL)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

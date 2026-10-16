-- =========================================================
-- Phase 25 — Official-led assessment, DSS accountability, allocation
-- corrections and honest SMS statuses (follows the e9ee3c7 audit).
--
-- 1. relief_allocations
--      + status 'Cancelled' (appended to the ENUM; existing values unchanged)
--      + event_id                (optional link to the disaster event)
--      + is_emergency_override, override_reason          (audit F-DSS-02)
--      + dss_score, dss_category, dss_rank, dss_ratings,
--        dss_model_version       (decision snapshot at approval, F-DSS-04)
--      + cancelled_by, cancelled_at, cancel_reason       (F-ALLOC-03)
--      + received_quantity, distribution_remarks          (partial receipt)
--      CHECKs: an override needs a reason; a cancellation needs a reason;
--              0 <= received_quantity <= quantity.
-- 2. disaster_reports (official field / paper assessment, Phase 25 §2)
--      + event_id, collection_method, paper_form_no (UNIQUE when given),
--        field_assessor, displacement_status, updated_at
--      report_date stays the ORIGINAL assessment date; created_at stays the
--      date it was ENCODED into the system.
-- 3. sms_logs
--      + status values 'Queued', 'Accepted by Gateway', 'Delivered'
--        (appended; legacy 'Sent' rows are kept and shown as
--        "Accepted by gateway (legacy)")
--      + provider_message_id
-- 4. Defensive CHECKs (added only when no existing row violates them):
--      relief_items.quantity >= 0, relief_allocations.quantity > 0.
--
-- SAFE / ADDITIVE ONLY: no DROP, no DELETE, no TRUNCATE, no data rewrite.
-- Safe to run more than once. Run AFTER the Phase 23 migration.
-- Rollback: the new columns are NULL/default for old rows and unused by the
-- Phase 24 code, so the Phase 24 application keeps working on a migrated
-- database. Do not remove ENUM values that rows already use.
-- =========================================================

SET FOREIGN_KEY_CHECKS = 1;

-- ---------- 1. relief_allocations ----------
ALTER TABLE `relief_allocations`
  MODIFY `status` enum('Pending','Approved','Distributed','Cancelled') NOT NULL DEFAULT 'Pending';

ALTER TABLE `relief_allocations`
  ADD COLUMN IF NOT EXISTS `event_id` int(11) DEFAULT NULL AFTER `request_item_id`,
  ADD COLUMN IF NOT EXISTS `is_emergency_override` tinyint(1) NOT NULL DEFAULT 0 AFTER `recommendation_reason`,
  ADD COLUMN IF NOT EXISTS `override_reason` varchar(500) DEFAULT NULL AFTER `is_emergency_override`,
  ADD COLUMN IF NOT EXISTS `dss_score` int(11) DEFAULT NULL AFTER `override_reason`,
  ADD COLUMN IF NOT EXISTS `dss_category` varchar(30) DEFAULT NULL AFTER `dss_score`,
  ADD COLUMN IF NOT EXISTS `dss_rank` int(11) DEFAULT NULL AFTER `dss_category`,
  ADD COLUMN IF NOT EXISTS `dss_ratings` varchar(255) DEFAULT NULL AFTER `dss_rank`,
  ADD COLUMN IF NOT EXISTS `dss_model_version` varchar(80) DEFAULT NULL AFTER `dss_ratings`,
  ADD COLUMN IF NOT EXISTS `cancelled_by` int(11) DEFAULT NULL AFTER `distributed_at`,
  ADD COLUMN IF NOT EXISTS `cancelled_at` timestamp NULL DEFAULT NULL AFTER `cancelled_by`,
  ADD COLUMN IF NOT EXISTS `cancel_reason` varchar(500) DEFAULT NULL AFTER `cancelled_at`,
  ADD COLUMN IF NOT EXISTS `received_quantity` int(11) DEFAULT NULL AFTER `cancel_reason`,
  ADD COLUMN IF NOT EXISTS `distribution_remarks` varchar(300) DEFAULT NULL AFTER `received_quantity`,
  ADD INDEX IF NOT EXISTS `idx_relief_allocations_event` (`event_id`),
  ADD INDEX IF NOT EXISTS `idx_relief_allocations_override` (`is_emergency_override`),
  ADD INDEX IF NOT EXISTS `idx_relief_allocations_cancelled_by` (`cancelled_by`);

-- Foreign keys and CHECKs are added only when missing (re-runnable).
DELIMITER //
DROP PROCEDURE IF EXISTS phase25_add_constraint //
CREATE PROCEDURE phase25_add_constraint(IN p_table VARCHAR(64), IN p_name VARCHAR(64), IN p_sql TEXT, IN p_guard TEXT)
BEGIN
  DECLARE v_exists INT DEFAULT 0;
  DECLARE v_bad INT DEFAULT 0;
  SELECT COUNT(*) INTO v_exists FROM information_schema.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = p_table AND CONSTRAINT_NAME = p_name;
  IF v_exists = 0 THEN
    IF p_guard IS NOT NULL THEN
      SET @phase25_guard_sql = CONCAT('SELECT COUNT(*) INTO @phase25_bad FROM ', p_guard);
      PREPARE g FROM @phase25_guard_sql; EXECUTE g; DEALLOCATE PREPARE g;
      SET v_bad = @phase25_bad;
    END IF;
    IF v_bad = 0 THEN
      SET @phase25_sql = p_sql;
      PREPARE s FROM @phase25_sql; EXECUTE s; DEALLOCATE PREPARE s;
    END IF;
  END IF;
END //
DELIMITER ;

CALL phase25_add_constraint('relief_allocations', 'fk_relief_allocations_event',
  'ALTER TABLE `relief_allocations` ADD CONSTRAINT `fk_relief_allocations_event` FOREIGN KEY (`event_id`) REFERENCES `disaster_events` (`event_id`) ON DELETE SET NULL', NULL);
CALL phase25_add_constraint('relief_allocations', 'fk_relief_allocations_cancelled_by',
  'ALTER TABLE `relief_allocations` ADD CONSTRAINT `fk_relief_allocations_cancelled_by` FOREIGN KEY (`cancelled_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL', NULL);
CALL phase25_add_constraint('relief_allocations', 'chk_relief_allocations_override',
  'ALTER TABLE `relief_allocations` ADD CONSTRAINT `chk_relief_allocations_override` CHECK (`is_emergency_override` = 0 OR (`override_reason` IS NOT NULL AND `override_reason` <> ''''))', NULL);
CALL phase25_add_constraint('relief_allocations', 'chk_relief_allocations_cancel',
  'ALTER TABLE `relief_allocations` ADD CONSTRAINT `chk_relief_allocations_cancel` CHECK (`status` <> ''Cancelled'' OR (`cancel_reason` IS NOT NULL AND `cancel_reason` <> ''''))', NULL);
CALL phase25_add_constraint('relief_allocations', 'chk_relief_allocations_received',
  'ALTER TABLE `relief_allocations` ADD CONSTRAINT `chk_relief_allocations_received` CHECK (`received_quantity` IS NULL OR (`received_quantity` >= 0 AND `received_quantity` <= `quantity`))', NULL);
CALL phase25_add_constraint('relief_allocations', 'chk_relief_allocations_quantity',
  'ALTER TABLE `relief_allocations` ADD CONSTRAINT `chk_relief_allocations_quantity` CHECK (`quantity` > 0)',
  '`relief_allocations` WHERE `quantity` <= 0');
CALL phase25_add_constraint('relief_items', 'chk_relief_items_quantity',
  'ALTER TABLE `relief_items` ADD CONSTRAINT `chk_relief_items_quantity` CHECK (`quantity` >= 0)',
  '`relief_items` WHERE `quantity` < 0');

-- ---------- 2. disaster_reports (official field / paper assessment) ----------
ALTER TABLE `disaster_reports`
  ADD COLUMN IF NOT EXISTS `event_id` int(11) DEFAULT NULL AFTER `household_id`,
  ADD COLUMN IF NOT EXISTS `collection_method` enum('Field Visit','Paper Form','Interview','Barangay Records','Direct Entry') DEFAULT NULL AFTER `reported_needs`,
  ADD COLUMN IF NOT EXISTS `paper_form_no` varchar(40) DEFAULT NULL AFTER `collection_method`,
  ADD COLUMN IF NOT EXISTS `field_assessor` varchar(150) DEFAULT NULL AFTER `paper_form_no`,
  ADD COLUMN IF NOT EXISTS `displacement_status` enum('Not Displaced','Staying with Relatives','In Evacuation Center','Other Shelter') DEFAULT NULL AFTER `field_assessor`,
  ADD COLUMN IF NOT EXISTS `updated_at` timestamp NULL DEFAULT NULL ON UPDATE current_timestamp() AFTER `created_at`,
  ADD UNIQUE INDEX IF NOT EXISTS `uq_disaster_reports_paper_form` (`paper_form_no`),
  ADD INDEX IF NOT EXISTS `idx_disaster_reports_event` (`event_id`),
  ADD INDEX IF NOT EXISTS `idx_disaster_reports_household_date` (`household_id`, `report_date`);

CALL phase25_add_constraint('disaster_reports', 'fk_disaster_reports_event',
  'ALTER TABLE `disaster_reports` ADD CONSTRAINT `fk_disaster_reports_event` FOREIGN KEY (`event_id`) REFERENCES `disaster_events` (`event_id`) ON DELETE SET NULL', NULL);

-- ---------- 3. sms_logs ----------
ALTER TABLE `sms_logs`
  MODIFY `status` enum('Sent','Failed','Not Configured','Queued','Accepted by Gateway','Delivered') NOT NULL DEFAULT 'Queued';
ALTER TABLE `sms_logs`
  ADD COLUMN IF NOT EXISTS `provider_message_id` varchar(100) DEFAULT NULL AFTER `provider_response`;

DROP PROCEDURE IF EXISTS phase25_add_constraint;

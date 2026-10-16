-- =========================================================
-- Phase 20 — Panel-requested automation
--   1. disaster_events          (a named disaster/event and its period)
--   2. disaster_affected_areas  (Administrator-recorded affected/flood area polygons)
--   3. sms_logs                 (event type, related IDs, provider response, attempts)
--
-- SAFE / ADDITIVE ONLY:
--   * no DROP, no DELETE, no TRUNCATE, no data rewrite
--   * new tables use CREATE TABLE IF NOT EXISTS
--   * new columns / indexes use ADD ... IF NOT EXISTS (MariaDB 10.0.2+)
--   * new foreign keys on the existing sms_logs table are added only if missing
--   * sms_logs.category ENUM is widened: all 13 existing values keep their
--     order, 1 value is appended
--   * safe to run more than once
--
-- The DSS is NOT changed: no scoring table or column is added or modified.
--
-- Run in phpMyAdmin on the existing database (Import tab), or:
--   mysql -u root barangay_disaster_db < database/migration_phase20_automation.sql
-- Fresh installs: barangay_disaster_db_FINAL.sql already contains Phase 20.
-- =========================================================

SET FOREIGN_KEY_CHECKS = 1;

-- ---------------------------------------------------------
-- 1. disaster_events — one named disaster/event (e.g. a typhoon) and its period.
--    Disaster reports are not re-linked: an event covers the reports whose
--    report_date falls inside start_date .. end_date (end_date NULL = ongoing).
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS `disaster_events` (
  `event_id` int(11) NOT NULL AUTO_INCREMENT,
  `event_name` varchar(150) NOT NULL,
  `disaster_type` varchar(50) NOT NULL,
  `start_date` date NOT NULL,
  `end_date` date DEFAULT NULL,
  `description` text DEFAULT NULL,
  `status` enum('Active','Closed') NOT NULL DEFAULT 'Active',
  `created_by` int(11) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`event_id`),
  UNIQUE KEY `uq_disaster_event_name` (`event_name`),
  KEY `idx_disaster_events_status` (`status`),
  KEY `fk_disaster_events_type` (`disaster_type`),
  KEY `fk_disaster_events_created_by` (`created_by`),
  CONSTRAINT `fk_disaster_events_type` FOREIGN KEY (`disaster_type`) REFERENCES `disaster_types` (`type_name`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_disaster_events_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `chk_disaster_event_dates` CHECK (`end_date` IS NULL OR `end_date` >= `start_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ---------------------------------------------------------
-- 2. disaster_affected_areas — an affected/flooded area RECORDED by the
--    Administrator for an event (validated GeoJSON Polygon/MultiPolygon).
--    The system does not predict or generate these areas.
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS `disaster_affected_areas` (
  `area_id` int(11) NOT NULL AUTO_INCREMENT,
  `event_id` int(11) NOT NULL,
  `hazard_type` enum('Flood','Typhoon','Landslide','General Emergency') NOT NULL DEFAULT 'Flood',
  `area_name` varchar(150) NOT NULL,
  `description` text DEFAULT NULL,
  `geojson` mediumtext NOT NULL,
  `vertex_count` int(11) NOT NULL DEFAULT 0,
  `status` enum('Active','Resolved') NOT NULL DEFAULT 'Active',
  `created_by` int(11) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_by` int(11) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `resolved_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`area_id`),
  KEY `idx_affected_areas_event` (`event_id`),
  KEY `idx_affected_areas_status` (`status`),
  KEY `fk_affected_areas_created_by` (`created_by`),
  KEY `fk_affected_areas_updated_by` (`updated_by`),
  CONSTRAINT `fk_affected_areas_event` FOREIGN KEY (`event_id`) REFERENCES `disaster_events` (`event_id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_affected_areas_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_affected_areas_updated_by` FOREIGN KEY (`updated_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ---------------------------------------------------------
-- 3. sms_logs — automated-SMS details (all nullable; manual SMS leaves them NULL)
--    * event_type: e.g. ALLOCATION_APPROVED, ALLOCATION_DISTRIBUTED
--    * household_id / allocation_id / request_id: what the SMS is about
--    * provider_response: short TextBee response text (never the API key)
--    * attempts / last_attempt_at: safe retry of a Failed / Not Configured row
--    Idempotency stays on the existing UNIQUE (event_key, recipient_number);
--    event_key encodes the record ID + event, e.g. "allocation:12:approved".
-- ---------------------------------------------------------
ALTER TABLE `sms_logs`
  ADD COLUMN IF NOT EXISTS `event_type` varchar(50) DEFAULT NULL AFTER `event_key`,
  ADD COLUMN IF NOT EXISTS `household_id` int(11) DEFAULT NULL AFTER `event_type`,
  ADD COLUMN IF NOT EXISTS `allocation_id` int(11) DEFAULT NULL AFTER `household_id`,
  ADD COLUMN IF NOT EXISTS `request_id` int(11) DEFAULT NULL AFTER `allocation_id`,
  ADD COLUMN IF NOT EXISTS `provider_response` varchar(500) DEFAULT NULL AFTER `error_message`,
  ADD COLUMN IF NOT EXISTS `attempts` int(11) NOT NULL DEFAULT 1 AFTER `provider_response`,
  ADD COLUMN IF NOT EXISTS `last_attempt_at` timestamp NULL DEFAULT NULL AFTER `sent_at`;
ALTER TABLE `sms_logs`
  ADD INDEX IF NOT EXISTS `idx_sms_logs_event_type` (`event_type`),
  ADD INDEX IF NOT EXISTS `idx_sms_logs_household` (`household_id`),
  ADD INDEX IF NOT EXISTS `idx_sms_logs_allocation` (`allocation_id`),
  ADD INDEX IF NOT EXISTS `idx_sms_logs_request` (`request_id`);

SET @fk := (SELECT COUNT(*) FROM information_schema.REFERENTIAL_CONSTRAINTS
            WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = 'fk_sms_logs_household');
SET @sql := IF(@fk = 0,
  'ALTER TABLE `sms_logs` ADD CONSTRAINT `fk_sms_logs_household` FOREIGN KEY (`household_id`) REFERENCES `households` (`household_id`) ON DELETE SET NULL',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk := (SELECT COUNT(*) FROM information_schema.REFERENTIAL_CONSTRAINTS
            WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = 'fk_sms_logs_allocation');
SET @sql := IF(@fk = 0,
  'ALTER TABLE `sms_logs` ADD CONSTRAINT `fk_sms_logs_allocation` FOREIGN KEY (`allocation_id`) REFERENCES `relief_allocations` (`allocation_id`) ON DELETE SET NULL',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk := (SELECT COUNT(*) FROM information_schema.REFERENTIAL_CONSTRAINTS
            WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = 'fk_sms_logs_request');
SET @sql := IF(@fk = 0,
  'ALTER TABLE `sms_logs` ADD CONSTRAINT `fk_sms_logs_request` FOREIGN KEY (`request_id`) REFERENCES `relief_requests` (`request_id`) ON DELETE SET NULL',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- category ENUM: the 13 Phase 19 values unchanged and in the same order, 1 appended.
ALTER TABLE `sms_logs`
  MODIFY `category` enum('Emergency Warning','Disaster Alert','Evacuation Warning','Relief Distribution Announcement','Distribution Schedule','Beneficiary Notification','Relief Availability','General',
                         'Report Status Update','Relief Request Update','Distribution Schedule Change','Delivery Completed','Evacuation Center Update',
                         'Relief Allocation Update') NOT NULL DEFAULT 'General';

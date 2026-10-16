-- =========================================================
-- Phase 19 — Capstone redesign (relief requests, evacuation centers,
-- feedback, in-app notifications, automatic SMS, map distribution sites)
--
-- SAFE / ADDITIVE ONLY:
--   * no DROP, no DELETE, no data rewrite
--   * new tables use CREATE TABLE IF NOT EXISTS
--   * new columns use ADD COLUMN IF NOT EXISTS (MariaDB 10.0.2+; XAMPP and
--     Hostinger both use MariaDB)
--   * the sms_logs.category ENUM is widened: every existing value is kept in
--     the same order, new values are appended at the end
--   * safe to run more than once
--
-- Run in phpMyAdmin on the existing barangay_disaster_db (Import tab), or:
--   mysql -u root barangay_disaster_db < database/migration_phase19_redesign.sql
-- =========================================================

SET FOREIGN_KEY_CHECKS = 1;

-- ---------------------------------------------------------
-- 1. relief_requests — a resident's request for relief for their household
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS `relief_requests` (
  `request_id` int(11) NOT NULL AUTO_INCREMENT,
  `household_id` int(11) NOT NULL,
  `user_id` int(11) DEFAULT NULL,
  `report_id` int(11) DEFAULT NULL,
  `urgency` enum('Low','Medium','High','Critical') NOT NULL DEFAULT 'Medium',
  `reason` text NOT NULL,
  `status` enum('Pending','Under Review','Approved','Partially Approved','Rejected','Allocated','Distributed') NOT NULL DEFAULT 'Pending',
  `admin_remarks` text DEFAULT NULL,
  `reviewed_by` int(11) DEFAULT NULL,
  `reviewed_at` timestamp NULL DEFAULT NULL,
  `processed_by` int(11) DEFAULT NULL,
  `processed_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`request_id`),
  KEY `idx_relief_requests_household` (`household_id`),
  KEY `idx_relief_requests_status` (`status`),
  KEY `idx_relief_requests_user` (`user_id`),
  KEY `idx_relief_requests_report` (`report_id`),
  KEY `fk_relief_requests_reviewed_by` (`reviewed_by`),
  KEY `fk_relief_requests_processed_by` (`processed_by`),
  CONSTRAINT `fk_relief_requests_household` FOREIGN KEY (`household_id`) REFERENCES `households` (`household_id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_relief_requests_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_relief_requests_report` FOREIGN KEY (`report_id`) REFERENCES `disaster_reports` (`report_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_relief_requests_reviewed_by` FOREIGN KEY (`reviewed_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_relief_requests_processed_by` FOREIGN KEY (`processed_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ---------------------------------------------------------
-- 2. relief_request_items — requested items and the Administrator's
--    approved quantity per item
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS `relief_request_items` (
  `request_item_id` int(11) NOT NULL AUTO_INCREMENT,
  `request_id` int(11) NOT NULL,
  `item_id` int(11) NOT NULL,
  `requested_quantity` int(11) NOT NULL,
  `approved_quantity` int(11) DEFAULT NULL,
  PRIMARY KEY (`request_item_id`),
  UNIQUE KEY `uq_request_item` (`request_id`,`item_id`),
  KEY `fk_relief_request_items_item` (`item_id`),
  CONSTRAINT `fk_relief_request_items_request` FOREIGN KEY (`request_id`) REFERENCES `relief_requests` (`request_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_relief_request_items_item` FOREIGN KEY (`item_id`) REFERENCES `relief_items` (`item_id`) ON DELETE RESTRICT,
  CONSTRAINT `chk_request_item_qty` CHECK (`requested_quantity` > 0 AND (`approved_quantity` IS NULL OR `approved_quantity` >= 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ---------------------------------------------------------
-- 3. relief_allocations.request_item_id — traces an allocation back to the
--    request line it fulfils (NULL for manual / DSS-only allocations)
-- ---------------------------------------------------------
ALTER TABLE `relief_allocations`
  ADD COLUMN IF NOT EXISTS `request_item_id` int(11) DEFAULT NULL AFTER `schedule_id`;
ALTER TABLE `relief_allocations`
  ADD INDEX IF NOT EXISTS `idx_relief_allocations_request_item` (`request_item_id`);
-- Foreign key added only if missing (MariaDB has no ADD CONSTRAINT IF NOT EXISTS
-- for foreign keys before 10.5; this guarded form works on 10.4+ too).
SET @fk_exists := (SELECT COUNT(*) FROM information_schema.REFERENTIAL_CONSTRAINTS
                   WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = 'fk_relief_allocations_request_item');
SET @sql := IF(@fk_exists = 0,
  'ALTER TABLE `relief_allocations` ADD CONSTRAINT `fk_relief_allocations_request_item` FOREIGN KEY (`request_item_id`) REFERENCES `relief_request_items` (`request_item_id`) ON DELETE SET NULL',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------
-- 4. distribution_schedules — optional site coordinates for the map
-- ---------------------------------------------------------
ALTER TABLE `distribution_schedules`
  ADD COLUMN IF NOT EXISTS `latitude` decimal(10,7) DEFAULT NULL AFTER `location`,
  ADD COLUMN IF NOT EXISTS `longitude` decimal(10,7) DEFAULT NULL AFTER `latitude`;

-- ---------------------------------------------------------
-- 5. evacuation_centers
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS `evacuation_centers` (
  `center_id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(150) NOT NULL,
  `address` varchar(255) NOT NULL,
  `purok` varchar(50) NOT NULL,
  `latitude` decimal(10,7) DEFAULT NULL,
  `longitude` decimal(10,7) DEFAULT NULL,
  `capacity` int(11) NOT NULL,
  `current_occupancy` int(11) NOT NULL DEFAULT 0,
  `facilities` text DEFAULT NULL,
  `contact_person` varchar(150) DEFAULT NULL,
  `contact_number` varchar(20) DEFAULT NULL,
  `status` enum('Open','Closed','Full') NOT NULL DEFAULT 'Closed',
  `created_by` int(11) DEFAULT NULL,
  `updated_by` int(11) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`center_id`),
  KEY `idx_evacuation_centers_status` (`status`),
  KEY `idx_evacuation_centers_purok` (`purok`),
  KEY `fk_evacuation_centers_created_by` (`created_by`),
  KEY `fk_evacuation_centers_updated_by` (`updated_by`),
  CONSTRAINT `fk_evacuation_centers_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_evacuation_centers_updated_by` FOREIGN KEY (`updated_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `chk_evacuation_capacity` CHECK (`capacity` > 0 AND `current_occupancy` >= 0 AND `current_occupancy` <= `capacity`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ---------------------------------------------------------
-- 6. evacuation_center_logs — occupancy / status history
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS `evacuation_center_logs` (
  `log_id` int(11) NOT NULL AUTO_INCREMENT,
  `center_id` int(11) NOT NULL,
  `previous_occupancy` int(11) DEFAULT NULL,
  `new_occupancy` int(11) NOT NULL,
  `previous_status` varchar(10) DEFAULT NULL,
  `new_status` varchar(10) NOT NULL,
  `remarks` varchar(255) DEFAULT NULL,
  `changed_by` int(11) DEFAULT NULL,
  `changed_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`log_id`),
  KEY `idx_evacuation_center_logs_center` (`center_id`),
  KEY `fk_evacuation_center_logs_user` (`changed_by`),
  CONSTRAINT `fk_evacuation_center_logs_center` FOREIGN KEY (`center_id`) REFERENCES `evacuation_centers` (`center_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_evacuation_center_logs_user` FOREIGN KEY (`changed_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ---------------------------------------------------------
-- 7. relief_feedback — one record per actual delivery. Exactly one of
--    beneficiary_id (scheduled delivery), request_id (fulfilled request) or
--    allocation_id (directly distributed allocation) identifies the delivery.
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS `relief_feedback` (
  `feedback_id` int(11) NOT NULL AUTO_INCREMENT,
  `household_id` int(11) NOT NULL,
  `user_id` int(11) DEFAULT NULL,
  `beneficiary_id` int(11) DEFAULT NULL,
  `request_id` int(11) DEFAULT NULL,
  `allocation_id` int(11) DEFAULT NULL,
  `received` enum('Yes','No') NOT NULL,
  `rating` tinyint(4) NOT NULL,
  `sufficiency` enum('Sufficient','Partially Sufficient','Insufficient') NOT NULL,
  `experience` enum('Excellent','Good','Fair','Poor') NOT NULL,
  `comments` text DEFAULT NULL,
  `is_complaint` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`feedback_id`),
  UNIQUE KEY `uq_feedback_beneficiary` (`beneficiary_id`),
  UNIQUE KEY `uq_feedback_request` (`request_id`),
  UNIQUE KEY `uq_feedback_allocation` (`allocation_id`),
  KEY `idx_relief_feedback_household` (`household_id`),
  KEY `idx_relief_feedback_complaint` (`is_complaint`),
  KEY `fk_relief_feedback_user` (`user_id`),
  CONSTRAINT `fk_relief_feedback_household` FOREIGN KEY (`household_id`) REFERENCES `households` (`household_id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_relief_feedback_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_relief_feedback_beneficiary` FOREIGN KEY (`beneficiary_id`) REFERENCES `distribution_beneficiaries` (`beneficiary_id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_relief_feedback_request` FOREIGN KEY (`request_id`) REFERENCES `relief_requests` (`request_id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_relief_feedback_allocation` FOREIGN KEY (`allocation_id`) REFERENCES `relief_allocations` (`allocation_id`) ON DELETE RESTRICT,
  CONSTRAINT `chk_feedback_rating` CHECK (`rating` BETWEEN 1 AND 5),
  CONSTRAINT `chk_feedback_one_delivery` CHECK (
    (`beneficiary_id` IS NOT NULL) + (`request_id` IS NOT NULL) + (`allocation_id` IS NOT NULL) = 1
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ---------------------------------------------------------
-- 8. notifications — in-app notifications. UNIQUE (user_id, event_key)
--    prevents the same event from notifying the same user twice; the
--    automatic SMS is sent only when this row is newly created.
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS `notifications` (
  `notification_id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `event_key` varchar(150) NOT NULL,
  `title` varchar(150) NOT NULL,
  `message` text NOT NULL,
  `link` varchar(255) DEFAULT NULL,
  `is_read` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `read_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`notification_id`),
  UNIQUE KEY `uq_notification_user_event` (`user_id`,`event_key`),
  KEY `idx_notifications_user_read` (`user_id`,`is_read`),
  CONSTRAINT `fk_notifications_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ---------------------------------------------------------
-- 9. sms_logs — automatic-SMS support
--    * event_key: which system event produced the SMS (NULL = manual SMS)
--    * unique (event_key, recipient_number): the same event is never texted
--      to the same number twice (NULLs — manual SMS — are not restricted)
--    * category ENUM widened (existing 8 values unchanged, 5 appended)
-- ---------------------------------------------------------
ALTER TABLE `sms_logs`
  ADD COLUMN IF NOT EXISTS `event_key` varchar(150) DEFAULT NULL AFTER `category`;
ALTER TABLE `sms_logs`
  ADD UNIQUE INDEX IF NOT EXISTS `uq_sms_event_recipient` (`event_key`,`recipient_number`);
ALTER TABLE `sms_logs`
  MODIFY `category` enum('Emergency Warning','Disaster Alert','Evacuation Warning','Relief Distribution Announcement','Distribution Schedule','Beneficiary Notification','Relief Availability','General',
                         'Report Status Update','Relief Request Update','Distribution Schedule Change','Delivery Completed','Evacuation Center Update') NOT NULL DEFAULT 'General';

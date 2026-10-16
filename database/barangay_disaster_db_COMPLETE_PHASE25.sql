-- =====================================================================
-- BARANGAY BINITAYAN — WEB-BASED POST-DISASTER MONITORING AND RELIEF
-- ALLOCATION WITH DECISION SUPPORT SYSTEM
--
-- barangay_disaster_db_COMPLETE_PHASE25.sql
-- ONE-FILE INSTALL: database + full Phase 25 structure + default settings
-- + one Administrator account + the synthetic defense data
-- ("Typhoon Binitayan Defense Demonstration 2026").
--
-- WHAT IT CONTAINS
--   1. CREATE DATABASE IF NOT EXISTS `barangay_disaster_db` and USE it
--   2. All 33 tables (Phases 1–25): keys, indexes, foreign keys, CHECKs
--      (same structure as barangay_disaster_db_FINAL.sql)
--   3. Default records: system settings, inventory categories, disaster types
--   4. Administrator test account   admin.binitayan.test@gmail.com
--   5. Defense data: 1 relief personnel, 8 resident accounts and households
--      (with members and map coordinates), 8 disaster reports with damage
--      assessments and Phase 23 immediate needs, relief items and stock,
--      1 evacuation center, hazard alerts, relief requests and allocations
--
-- SYNTHETIC DATA ONLY. All names and 0900 numbers are fictional. Passwords
-- are stored only as bcrypt hashes. Test password for every account,
-- including the Administrator: BinitayanTest2026!
-- Change the Administrator password after the first login (My Profile)
-- before any real use, or use barangay_disaster_db_FINAL.sql (no accounts,
-- no data) for a production install.
--
-- SAFE: no DROP, no DELETE, no TRUNCATE, no GRANT, no DEFINER.
-- If the tables already exist the import stops at the first
-- "table already exists" error, so an existing database is never changed.
-- Existing databases should run the migration files instead.
--
-- HOW TO IMPORT (XAMPP)
--   1. Start Apache and MySQL in the XAMPP Control Panel.
--   2. phpMyAdmin -> Import (no database needs to be selected) -> choose this
--      file -> Go. It creates barangay_disaster_db.
--   3. Log in at http://localhost:5173 with admin.binitayan.test@gmail.com.
--   DSS scores are calculated live when a page opens. From Phase 25 a copy
--   of the score, category, rank and ratings is frozen on each allocation
--   when it is approved (the sample allocations below predate that and
--   show no snapshot). SMS goes out only when relief is marked Ready.
--   Expected: H08 79 High (needs review), H07 76, H03 72, H06 72, H04 71,
--   H05 52, H02 49, H01 36.
-- =====================================================================

CREATE DATABASE IF NOT EXISTS `barangay_disaster_db`
  DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
USE `barangay_disaster_db`;

-- =====================================================================
-- PART A — DATABASE STRUCTURE AND DEFAULT RECORDS (Phases 1–25)
-- =====================================================================
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------
-- 1. disaster_types
--    Configurable disaster types (Disaster Settings).
-- ---------------------------------------------------------
CREATE TABLE `disaster_types` (
  `type_id` int(11) NOT NULL AUTO_INCREMENT,
  `type_name` varchar(50) NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`type_id`),
  UNIQUE KEY `type_name` (`type_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ---------------------------------------------------------
-- 2. inventory_categories
--    Configurable relief item categories (Inventory Settings).
-- ---------------------------------------------------------
CREATE TABLE `inventory_categories` (
  `category_id` int(11) NOT NULL AUTO_INCREMENT,
  `category_name` varchar(50) NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`category_id`),
  UNIQUE KEY `category_name` (`category_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ---------------------------------------------------------
-- 3. relief_items
--    Relief inventory: current stock, unit, minimum (low-stock) level.
-- ---------------------------------------------------------
CREATE TABLE `relief_items` (
  `item_id` int(11) NOT NULL AUTO_INCREMENT,
  `item_name` varchar(150) NOT NULL,
  `category` varchar(50) NOT NULL DEFAULT 'Other',
  `quantity` int(11) NOT NULL DEFAULT 0,
  `unit` varchar(50) NOT NULL DEFAULT 'pcs',
  `minimum_level` int(11) NOT NULL DEFAULT 10,
  `expiration_date` date DEFAULT NULL,
  `date_added` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`item_id`),
  KEY `fk_relief_items_category` (`category`),
  CONSTRAINT `fk_relief_items_category` FOREIGN KEY (`category`) REFERENCES `inventory_categories` (`category_name`) ON UPDATE CASCADE,
  CONSTRAINT `chk_relief_items_quantity` CHECK (`quantity` >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ---------------------------------------------------------
-- 4. users
--    Accounts for the three roles: admin, resident, relief_personnel.
-- ---------------------------------------------------------
CREATE TABLE `users` (
  `user_id` int(11) NOT NULL AUTO_INCREMENT,
  `full_name` varchar(150) NOT NULL,
  `email` varchar(150) NOT NULL,
  `password` varchar(255) NOT NULL,
  `role` enum('admin','resident','relief_personnel') NOT NULL DEFAULT 'resident',
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `contact_number` varchar(20) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ---------------------------------------------------------
-- 5. audit_logs
--    Audit trail of user actions.
-- ---------------------------------------------------------
CREATE TABLE `audit_logs` (
  `log_id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) DEFAULT NULL,
  `action` varchar(255) NOT NULL,
  `details` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`log_id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `audit_logs_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ---------------------------------------------------------
-- 6. donations
--    Donations received (added to stock).
-- ---------------------------------------------------------
CREATE TABLE `donations` (
  `donation_id` int(11) NOT NULL AUTO_INCREMENT,
  `donor_name` varchar(150) NOT NULL,
  `donor_contact` varchar(100) DEFAULT NULL,
  `item_id` int(11) NOT NULL,
  `quantity` int(11) NOT NULL,
  `donation_date` date NOT NULL,
  `remarks` text DEFAULT NULL,
  `recorded_by` int(11) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`donation_id`),
  KEY `recorded_by` (`recorded_by`),
  KEY `fk_donations_item` (`item_id`),
  CONSTRAINT `donations_ibfk_2` FOREIGN KEY (`recorded_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_donations_item` FOREIGN KEY (`item_id`) REFERENCES `relief_items` (`item_id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ---------------------------------------------------------
-- 7. hazard_alerts
--    Hazard alerts (active alerts feed the DSS location factor).
-- ---------------------------------------------------------
CREATE TABLE `hazard_alerts` (
  `alert_id` int(11) NOT NULL AUTO_INCREMENT,
  `hazard_type` enum('Flood','Typhoon','Landslide','General Emergency') NOT NULL,
  `status` enum('Normal','Alert','Warning','Critical') NOT NULL DEFAULT 'Alert',
  `title` varchar(150) NOT NULL,
  `description` text DEFAULT NULL,
  `affected_purok` varchar(50) DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `issued_by` int(11) DEFAULT NULL,
  `issued_at` timestamp NULL DEFAULT current_timestamp(),
  `resolved_by` int(11) DEFAULT NULL,
  `resolved_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`alert_id`),
  KEY `issued_by` (`issued_by`),
  KEY `resolved_by` (`resolved_by`),
  KEY `idx_hazard_alerts_is_active` (`is_active`),
  CONSTRAINT `hazard_alerts_ibfk_1` FOREIGN KEY (`issued_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `hazard_alerts_ibfk_2` FOREIGN KEY (`resolved_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ---------------------------------------------------------
-- 8. households
--    Household profiles, vulnerability counts and map coordinates (DSS inputs).
-- ---------------------------------------------------------
CREATE TABLE `households` (
  `household_id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) DEFAULT NULL,
  `head_of_family` varchar(150) NOT NULL,
  `purok` varchar(50) NOT NULL,
  `address` varchar(255) NOT NULL,
  `number_of_members` int(11) NOT NULL DEFAULT 1,
  `vulnerable_members` int(11) NOT NULL DEFAULT 0,
  `children_count` int(11) NOT NULL DEFAULT 0,
  `seniors_count` int(11) NOT NULL DEFAULT 0,
  `pwd_count` int(11) NOT NULL DEFAULT 0,
  `pregnant_count` int(11) NOT NULL DEFAULT 0,
  `medical_needs_count` int(11) NOT NULL DEFAULT 0,
  `other_vulnerable_count` int(11) NOT NULL DEFAULT 0,
  `contact_number` varchar(20) DEFAULT NULL,
  `latitude` decimal(10,7) DEFAULT NULL,
  `longitude` decimal(10,7) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`household_id`),
  KEY `user_id` (`user_id`),
  KEY `idx_households_purok` (`purok`),
  CONSTRAINT `households_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ---------------------------------------------------------
-- 9. disaster_reports
--    Resident disaster reports (severity + status feed the DSS).
-- ---------------------------------------------------------
CREATE TABLE `disaster_reports` (
  `report_id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `household_id` int(11) DEFAULT NULL,
  `event_id` int(11) DEFAULT NULL,
  `disaster_type` varchar(50) NOT NULL,
  `location` varchar(255) NOT NULL,
  `latitude` decimal(10,7) DEFAULT NULL,
  `longitude` decimal(10,7) DEFAULT NULL,
  `description` text DEFAULT NULL,
  `reported_needs` varchar(100) DEFAULT NULL,
  `collection_method` enum('Field Visit','Paper Form','Interview','Barangay Records','Direct Entry') DEFAULT NULL,
  `paper_form_no` varchar(40) DEFAULT NULL,
  `field_assessor` varchar(150) DEFAULT NULL,
  `displacement_status` enum('Not Displaced','Staying with Relatives','In Evacuation Center','Other Shelter') DEFAULT NULL,
  `report_date` date NOT NULL,
  `report_time` time DEFAULT NULL,
  `severity` enum('Low','Medium','High','Critical') NOT NULL,
  `status` enum('Pending','Verified','Rejected') NOT NULL DEFAULT 'Pending',
  `verified_by` int(11) DEFAULT NULL,
  `verified_at` timestamp NULL DEFAULT NULL,
  `verification_remarks` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT NULL ON UPDATE current_timestamp(),
  PRIMARY KEY (`report_id`),
  UNIQUE KEY `uq_disaster_reports_paper_form` (`paper_form_no`),
  KEY `user_id` (`user_id`),
  KEY `household_id` (`household_id`),
  KEY `verified_by` (`verified_by`),
  KEY `idx_disaster_reports_status` (`status`),
  KEY `idx_disaster_reports_severity` (`severity`),
  KEY `fk_disaster_reports_disaster_type` (`disaster_type`),
  KEY `idx_disaster_reports_event` (`event_id`),
  KEY `idx_disaster_reports_household_date` (`household_id`,`report_date`),
  CONSTRAINT `disaster_reports_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE,
  CONSTRAINT `disaster_reports_ibfk_2` FOREIGN KEY (`household_id`) REFERENCES `households` (`household_id`) ON DELETE SET NULL,
  CONSTRAINT `disaster_reports_ibfk_3` FOREIGN KEY (`verified_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_disaster_reports_disaster_type` FOREIGN KEY (`disaster_type`) REFERENCES `disaster_types` (`type_name`) ON UPDATE CASCADE,
  CONSTRAINT `fk_disaster_reports_event` FOREIGN KEY (`event_id`) REFERENCES `disaster_events` (`event_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ---------------------------------------------------------
-- 10. damage_assessments
--    One damage assessment per report (four damage categories feed the DSS).
-- ---------------------------------------------------------
CREATE TABLE `damage_assessments` (
  `assessment_id` int(11) NOT NULL AUTO_INCREMENT,
  `report_id` int(11) NOT NULL,
  `house_damage` enum('None','Minor','Major','Totally Damaged') NOT NULL DEFAULT 'None',
  `infrastructure_damage` enum('None','Minor','Major','Totally Damaged') NOT NULL DEFAULT 'None',
  `property_damage` enum('None','Minor','Major','Totally Damaged') NOT NULL DEFAULT 'None',
  `agricultural_damage` enum('None','Minor','Major','Totally Damaged') NOT NULL DEFAULT 'None',
  `estimated_severity` enum('Low','Medium','High','Critical') NOT NULL DEFAULT 'Low',
  `remarks` text DEFAULT NULL,
  `assessed_by` int(11) DEFAULT NULL,
  `assessed_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`assessment_id`),
  UNIQUE KEY `report_id` (`report_id`),
  KEY `assessed_by` (`assessed_by`),
  CONSTRAINT `damage_assessments_ibfk_1` FOREIGN KEY (`report_id`) REFERENCES `disaster_reports` (`report_id`) ON DELETE CASCADE,
  CONSTRAINT `damage_assessments_ibfk_2` FOREIGN KEY (`assessed_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ---------------------------------------------------------
-- 11. household_members
--    Members listed for each household.
-- ---------------------------------------------------------
CREATE TABLE `household_members` (
  `member_id` int(11) NOT NULL AUTO_INCREMENT,
  `household_id` int(11) NOT NULL,
  `full_name` varchar(150) NOT NULL,
  `relationship` varchar(100) DEFAULT NULL,
  `age` int(11) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`member_id`),
  KEY `household_id` (`household_id`),
  CONSTRAINT `household_members_ibfk_1` FOREIGN KEY (`household_id`) REFERENCES `households` (`household_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ---------------------------------------------------------
-- 12. inventory_logs
--    Inventory movement history (Stock In / Stock Out / Adjustment / Donation).
-- ---------------------------------------------------------
CREATE TABLE `inventory_logs` (
  `log_id` int(11) NOT NULL AUTO_INCREMENT,
  `item_id` int(11) NOT NULL,
  `log_type` enum('Stock In','Stock Out','Adjustment','Donation') NOT NULL,
  `quantity_change` int(11) NOT NULL,
  `resulting_quantity` int(11) NOT NULL,
  `reference` varchar(255) DEFAULT NULL,
  `performed_by` int(11) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`log_id`),
  KEY `performed_by` (`performed_by`),
  KEY `fk_inventory_logs_item` (`item_id`),
  CONSTRAINT `fk_inventory_logs_item` FOREIGN KEY (`item_id`) REFERENCES `relief_items` (`item_id`) ON DELETE RESTRICT,
  CONSTRAINT `inventory_logs_ibfk_2` FOREIGN KEY (`performed_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ---------------------------------------------------------
-- 13. login_history
--    Login / logout history, including failed attempts.
-- ---------------------------------------------------------
CREATE TABLE `login_history` (
  `history_id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) DEFAULT NULL,
  `email_attempted` varchar(150) DEFAULT NULL,
  `login_status` enum('Success','Failed') NOT NULL,
  `failure_reason` varchar(255) DEFAULT NULL,
  `login_at` timestamp NULL DEFAULT current_timestamp(),
  `logout_at` timestamp NULL DEFAULT NULL,
  `ip_address` varchar(45) DEFAULT NULL,
  PRIMARY KEY (`history_id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `login_history_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ---------------------------------------------------------
-- 14. relief_packages
--    Named relief bundles used by distribution schedules.
-- ---------------------------------------------------------
CREATE TABLE `relief_packages` (
  `package_id` int(11) NOT NULL AUTO_INCREMENT,
  `package_name` varchar(150) NOT NULL,
  `description` text DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_by` int(11) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`package_id`),
  KEY `created_by` (`created_by`),
  CONSTRAINT `relief_packages_ibfk_1` FOREIGN KEY (`created_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ---------------------------------------------------------
-- 15. distribution_schedules
--    Scheduled relief distributions (package, date, location, personnel).
-- ---------------------------------------------------------
CREATE TABLE `distribution_schedules` (
  `schedule_id` int(11) NOT NULL AUTO_INCREMENT,
  `package_id` int(11) NOT NULL,
  `distribution_date` date NOT NULL,
  `distribution_time` time DEFAULT NULL,
  `location` varchar(255) NOT NULL,
  `latitude` decimal(10,7) DEFAULT NULL,
  `longitude` decimal(10,7) DEFAULT NULL,
  `assigned_personnel` int(11) DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `created_by` int(11) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`schedule_id`),
  KEY `package_id` (`package_id`),
  KEY `assigned_personnel` (`assigned_personnel`),
  KEY `created_by` (`created_by`),
  CONSTRAINT `distribution_schedules_ibfk_1` FOREIGN KEY (`package_id`) REFERENCES `relief_packages` (`package_id`),
  CONSTRAINT `distribution_schedules_ibfk_2` FOREIGN KEY (`assigned_personnel`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `distribution_schedules_ibfk_3` FOREIGN KEY (`created_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ---------------------------------------------------------
-- 16. distribution_beneficiaries
--    Households on a schedule and their delivery status.
-- ---------------------------------------------------------
CREATE TABLE `distribution_beneficiaries` (
  `beneficiary_id` int(11) NOT NULL AUTO_INCREMENT,
  `schedule_id` int(11) NOT NULL,
  `household_id` int(11) NOT NULL,
  `is_verified` tinyint(1) NOT NULL DEFAULT 0,
  `verified_by` int(11) DEFAULT NULL,
  `verified_at` timestamp NULL DEFAULT NULL,
  `status` enum('Pending','Prepared','Dispatched','Delivered','Cancelled') NOT NULL DEFAULT 'Pending',
  `status_updated_by` int(11) DEFAULT NULL,
  `status_updated_at` timestamp NULL DEFAULT NULL,
  `remarks` text DEFAULT NULL,
  PRIMARY KEY (`beneficiary_id`),
  UNIQUE KEY `unique_schedule_household` (`schedule_id`,`household_id`),
  KEY `verified_by` (`verified_by`),
  KEY `status_updated_by` (`status_updated_by`),
  KEY `idx_distribution_beneficiaries_status` (`status`),
  KEY `fk_distribution_beneficiaries_household` (`household_id`),
  CONSTRAINT `distribution_beneficiaries_ibfk_1` FOREIGN KEY (`schedule_id`) REFERENCES `distribution_schedules` (`schedule_id`) ON DELETE CASCADE,
  CONSTRAINT `distribution_beneficiaries_ibfk_3` FOREIGN KEY (`verified_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `distribution_beneficiaries_ibfk_4` FOREIGN KEY (`status_updated_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_distribution_beneficiaries_household` FOREIGN KEY (`household_id`) REFERENCES `households` (`household_id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ---------------------------------------------------------
-- 17. delivery_reports
--    Proof of delivery for a scheduled beneficiary.
-- ---------------------------------------------------------
CREATE TABLE `delivery_reports` (
  `report_id` int(11) NOT NULL AUTO_INCREMENT,
  `beneficiary_id` int(11) NOT NULL,
  `recipient_name` varchar(150) NOT NULL,
  `remarks` text DEFAULT NULL,
  `submitted_by` int(11) DEFAULT NULL,
  `submitted_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`report_id`),
  UNIQUE KEY `beneficiary_id` (`beneficiary_id`),
  KEY `submitted_by` (`submitted_by`),
  CONSTRAINT `delivery_reports_ibfk_1` FOREIGN KEY (`beneficiary_id`) REFERENCES `distribution_beneficiaries` (`beneficiary_id`) ON DELETE CASCADE,
  CONSTRAINT `delivery_reports_ibfk_2` FOREIGN KEY (`submitted_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ---------------------------------------------------------
-- 18. delivery_report_photos
--    Photos attached to delivery reports.
-- ---------------------------------------------------------
CREATE TABLE `delivery_report_photos` (
  `photo_id` int(11) NOT NULL AUTO_INCREMENT,
  `report_id` int(11) NOT NULL,
  `file_path` varchar(255) NOT NULL,
  `uploaded_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`photo_id`),
  KEY `report_id` (`report_id`),
  CONSTRAINT `delivery_report_photos_ibfk_1` FOREIGN KEY (`report_id`) REFERENCES `delivery_reports` (`report_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ---------------------------------------------------------
-- 18a. relief_requests
--    Phase 19: resident relief requests (one open request per household).
-- ---------------------------------------------------------
CREATE TABLE `relief_requests` (
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
-- 18b. relief_request_items
--    Phase 19: requested items and Administrator-approved quantities.
-- ---------------------------------------------------------
CREATE TABLE `relief_request_items` (
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
-- 19. relief_allocations
--    Relief allocations: Pending -> Approved -> Distributed (relief status feeds the DSS).
--    Phase 21: an Approved allocation becomes "Ready for Distribution" when ready_at is set
--    with a verified schedule date and location (status stays 'Approved', so stock stays reserved).
-- ---------------------------------------------------------
CREATE TABLE `relief_allocations` (
  `allocation_id` int(11) NOT NULL AUTO_INCREMENT,
  `household_id` int(11) NOT NULL,
  `item_id` int(11) NOT NULL,
  `schedule_id` int(11) DEFAULT NULL,
  `request_item_id` int(11) DEFAULT NULL,
  `event_id` int(11) DEFAULT NULL,
  `quantity` int(11) NOT NULL,
  `status` enum('Pending','Approved','Distributed','Cancelled') NOT NULL DEFAULT 'Pending',
  `approved_by` int(11) DEFAULT NULL,
  `approved_at` timestamp NULL DEFAULT NULL,
  `ready_at` timestamp NULL DEFAULT NULL,
  `ready_by` int(11) DEFAULT NULL,
  `ready_schedule_date` date DEFAULT NULL,
  `ready_schedule_time` time DEFAULT NULL,
  `ready_location` varchar(255) DEFAULT NULL,
  `ready_instructions` varchar(300) DEFAULT NULL,
  `recommendation_reason` text DEFAULT NULL,
  `is_emergency_override` tinyint(1) NOT NULL DEFAULT 0,
  `override_reason` varchar(500) DEFAULT NULL,
  `dss_score` int(11) DEFAULT NULL,
  `dss_category` varchar(30) DEFAULT NULL,
  `dss_rank` int(11) DEFAULT NULL,
  `dss_ratings` varchar(255) DEFAULT NULL,
  `dss_model_version` varchar(80) DEFAULT NULL,
  `allocation_date` date NOT NULL,
  `distributed_by` int(11) DEFAULT NULL,
  `distributed_at` timestamp NULL DEFAULT NULL,
  `cancelled_by` int(11) DEFAULT NULL,
  `cancelled_at` timestamp NULL DEFAULT NULL,
  `cancel_reason` varchar(500) DEFAULT NULL,
  `received_quantity` int(11) DEFAULT NULL,
  `distribution_remarks` varchar(300) DEFAULT NULL,
  PRIMARY KEY (`allocation_id`),
  KEY `schedule_id` (`schedule_id`),
  KEY `approved_by` (`approved_by`),
  KEY `distributed_by` (`distributed_by`),
  KEY `idx_relief_allocations_status` (`status`),
  KEY `fk_relief_allocations_household` (`household_id`),
  KEY `fk_relief_allocations_item` (`item_id`),
  KEY `idx_relief_allocations_request_item` (`request_item_id`),
  KEY `idx_relief_allocations_ready` (`ready_at`),
  KEY `idx_relief_allocations_ready_by` (`ready_by`),
  KEY `idx_relief_allocations_event` (`event_id`),
  KEY `idx_relief_allocations_override` (`is_emergency_override`),
  KEY `idx_relief_allocations_cancelled_by` (`cancelled_by`),
  CONSTRAINT `fk_relief_allocations_cancelled_by` FOREIGN KEY (`cancelled_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_relief_allocations_event` FOREIGN KEY (`event_id`) REFERENCES `disaster_events` (`event_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_relief_allocations_household` FOREIGN KEY (`household_id`) REFERENCES `households` (`household_id`),
  CONSTRAINT `fk_relief_allocations_item` FOREIGN KEY (`item_id`) REFERENCES `relief_items` (`item_id`),
  CONSTRAINT `fk_relief_allocations_ready_by` FOREIGN KEY (`ready_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_relief_allocations_request_item` FOREIGN KEY (`request_item_id`) REFERENCES `relief_request_items` (`request_item_id`) ON DELETE SET NULL,
  CONSTRAINT `relief_allocations_ibfk_3` FOREIGN KEY (`schedule_id`) REFERENCES `distribution_schedules` (`schedule_id`) ON DELETE SET NULL,
  CONSTRAINT `relief_allocations_ibfk_4` FOREIGN KEY (`approved_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `relief_allocations_ibfk_5` FOREIGN KEY (`distributed_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `chk_relief_allocations_ready` CHECK (`ready_at` is null or `ready_schedule_date` is not null and `ready_location` is not null and `ready_location` <> ''),
  CONSTRAINT `chk_relief_allocations_override` CHECK (`is_emergency_override` = 0 or `override_reason` is not null and `override_reason` <> ''),
  CONSTRAINT `chk_relief_allocations_cancel` CHECK (`status` <> 'Cancelled' or `cancel_reason` is not null and `cancel_reason` <> ''),
  CONSTRAINT `chk_relief_allocations_received` CHECK (`received_quantity` is null or `received_quantity` >= 0 and `received_quantity` <= `quantity`),
  CONSTRAINT `chk_relief_allocations_quantity` CHECK (`quantity` > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ---------------------------------------------------------
-- 20. relief_package_items
--    Items and quantities inside each relief package.
-- ---------------------------------------------------------
CREATE TABLE `relief_package_items` (
  `package_item_id` int(11) NOT NULL AUTO_INCREMENT,
  `package_id` int(11) NOT NULL,
  `item_id` int(11) NOT NULL,
  `quantity` int(11) NOT NULL,
  PRIMARY KEY (`package_item_id`),
  UNIQUE KEY `unique_package_item` (`package_id`,`item_id`),
  KEY `fk_relief_package_items_item` (`item_id`),
  CONSTRAINT `fk_relief_package_items_item` FOREIGN KEY (`item_id`) REFERENCES `relief_items` (`item_id`) ON DELETE RESTRICT,
  CONSTRAINT `relief_package_items_ibfk_1` FOREIGN KEY (`package_id`) REFERENCES `relief_packages` (`package_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ---------------------------------------------------------
-- 21. relief_recommendation_rejections
--    Phase 18: Administrator rejections of computed relief recommendations.
-- ---------------------------------------------------------
CREATE TABLE `relief_recommendation_rejections` (
  `rejection_id` int(11) NOT NULL AUTO_INCREMENT,
  `household_id` int(11) NOT NULL,
  `item_id` int(11) NOT NULL,
  `reason` varchar(255) DEFAULT NULL,
  `rejected_by` int(11) DEFAULT NULL,
  `rejected_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`rejection_id`),
  UNIQUE KEY `uq_recommendation_rejection` (`household_id`,`item_id`),
  KEY `fk_rec_rejection_item` (`item_id`),
  KEY `fk_rec_rejection_user` (`rejected_by`),
  CONSTRAINT `fk_rec_rejection_household` FOREIGN KEY (`household_id`) REFERENCES `households` (`household_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_rec_rejection_item` FOREIGN KEY (`item_id`) REFERENCES `relief_items` (`item_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_rec_rejection_user` FOREIGN KEY (`rejected_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ---------------------------------------------------------
-- 22. report_photos
--    Photos attached to disaster reports.
-- ---------------------------------------------------------
CREATE TABLE `report_photos` (
  `photo_id` int(11) NOT NULL AUTO_INCREMENT,
  `report_id` int(11) NOT NULL,
  `file_path` varchar(255) NOT NULL,
  `uploaded_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`photo_id`),
  KEY `report_id` (`report_id`),
  CONSTRAINT `report_photos_ibfk_1` FOREIGN KEY (`report_id`) REFERENCES `disaster_reports` (`report_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ---------------------------------------------------------
-- 23. sms_logs
--    SMS history (manual and automatic), status, event type and provider response (TextBee).
-- ---------------------------------------------------------
CREATE TABLE `sms_logs` (
  `sms_id` int(11) NOT NULL AUTO_INCREMENT,
  `recipient_type` enum('Resident','Relief Personnel','Household','Custom') NOT NULL,
  `recipient_name` varchar(150) DEFAULT NULL,
  `recipient_number` varchar(20) NOT NULL,
  `message` text NOT NULL,
  `category` enum('Emergency Warning','Disaster Alert','Evacuation Warning','Relief Distribution Announcement','Distribution Schedule','Beneficiary Notification','Relief Availability','General','Report Status Update','Relief Request Update','Distribution Schedule Change','Delivery Completed','Evacuation Center Update','Relief Allocation Update') NOT NULL DEFAULT 'General',
  `event_key` varchar(150) DEFAULT NULL,
  `event_type` varchar(50) DEFAULT NULL,
  `household_id` int(11) DEFAULT NULL,
  `allocation_id` int(11) DEFAULT NULL,
  `request_id` int(11) DEFAULT NULL,
  `status` enum('Sent','Failed','Not Configured','Queued','Accepted by Gateway','Delivered') NOT NULL DEFAULT 'Queued',
  `error_message` text DEFAULT NULL,
  `provider_response` varchar(500) DEFAULT NULL,
  `provider_message_id` varchar(100) DEFAULT NULL,
  `attempts` int(11) NOT NULL DEFAULT 1,
  `sent_by` int(11) DEFAULT NULL,
  `sent_at` timestamp NULL DEFAULT current_timestamp(),
  `last_attempt_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`sms_id`),
  UNIQUE KEY `uq_sms_event_recipient` (`event_key`,`recipient_number`),
  KEY `sent_by` (`sent_by`),
  KEY `idx_sms_logs_event_type` (`event_type`),
  KEY `idx_sms_logs_household` (`household_id`),
  KEY `idx_sms_logs_allocation` (`allocation_id`),
  KEY `idx_sms_logs_request` (`request_id`),
  CONSTRAINT `fk_sms_logs_allocation` FOREIGN KEY (`allocation_id`) REFERENCES `relief_allocations` (`allocation_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_sms_logs_household` FOREIGN KEY (`household_id`) REFERENCES `households` (`household_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_sms_logs_request` FOREIGN KEY (`request_id`) REFERENCES `relief_requests` (`request_id`) ON DELETE SET NULL,
  CONSTRAINT `sms_logs_ibfk_1` FOREIGN KEY (`sent_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ---------------------------------------------------------
-- 24. system_settings
--    Key-value system settings (contact details, inventory defaults).
-- ---------------------------------------------------------
CREATE TABLE `system_settings` (
  `setting_key` varchar(100) NOT NULL,
  `setting_value` text DEFAULT NULL,
  `updated_by` int(11) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`setting_key`),
  KEY `updated_by` (`updated_by`),
  CONSTRAINT `system_settings_ibfk_1` FOREIGN KEY (`updated_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ---------------------------------------------------------
-- 25. weather_logs
--    Manual / API weather observations.
-- ---------------------------------------------------------
CREATE TABLE `weather_logs` (
  `weather_id` int(11) NOT NULL AUTO_INCREMENT,
  `log_date` date NOT NULL,
  `log_time` time DEFAULT NULL,
  `temperature` decimal(4,1) DEFAULT NULL,
  `rainfall_mm` decimal(6,1) DEFAULT NULL,
  `weather_condition` enum('Sunny','Cloudy','Overcast','Rainy','Stormy','Foggy','Other') NOT NULL DEFAULT 'Sunny',
  `wind_speed_kph` decimal(5,1) DEFAULT NULL,
  `wind_direction` varchar(10) DEFAULT NULL,
  `source` enum('Manual','API') NOT NULL DEFAULT 'Manual',
  `remarks` text DEFAULT NULL,
  `recorded_by` int(11) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`weather_id`),
  KEY `recorded_by` (`recorded_by`),
  CONSTRAINT `weather_logs_ibfk_1` FOREIGN KEY (`recorded_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ---------------------------------------------------------
-- 26. evacuation_centers
--    Phase 19: evacuation centers (capacity, occupancy, status).
-- ---------------------------------------------------------
CREATE TABLE `evacuation_centers` (
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
-- 27. evacuation_center_logs
--    Phase 19: occupancy / status history.
-- ---------------------------------------------------------
CREATE TABLE `evacuation_center_logs` (
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
-- 28. relief_feedback
--    Phase 19: resident feedback, one per delivered record.
-- ---------------------------------------------------------
CREATE TABLE `relief_feedback` (
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
-- 29. notifications
--    Phase 19: in-app notifications; UNIQUE (user_id, event_key) prevents duplicates.
-- ---------------------------------------------------------
CREATE TABLE `notifications` (
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
-- 30. disaster_events
--    Phase 20: a named disaster/event and its period (reports dated inside it).
-- ---------------------------------------------------------
CREATE TABLE `disaster_events` (
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
-- 31. disaster_affected_areas
--    Phase 20: Administrator-recorded affected/flood area polygons (GeoJSON).
-- ---------------------------------------------------------
CREATE TABLE `disaster_affected_areas` (
  `area_id` int(11) NOT NULL AUTO_INCREMENT,
  `event_id` int(11) DEFAULT NULL,
  `area_type` enum('Recorded Affected Area','Flood-Prone Zone') NOT NULL DEFAULT 'Recorded Affected Area',
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
  CONSTRAINT `fk_affected_areas_updated_by` FOREIGN KEY (`updated_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `chk_affected_area_event` CHECK (`area_type` <> 'Recorded Affected Area' OR `event_id` IS NOT NULL)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- =========================================================
-- DEFAULT RECORDS (essential configuration for a fresh install)
-- These are the only rows inserted. All can be edited later in
-- System Settings, Inventory Settings and Disaster Settings.
-- The DSS relief-need rules use the category names Food, Water,
-- Hygiene, Medical and Shelter; keep those names.
-- =========================================================

-- System settings defaults (editable later in System Settings)
INSERT INTO system_settings (setting_key, setting_value) VALUES
('barangay_name', 'Barangay Binitayan'),
('system_name', 'Post-Disaster Monitoring and Relief Allocation System'),
('barangay_address', 'Barangay Hall, Binitayan'),
('office_hours', 'Monday–Friday, 8:00 AM – 5:00 PM'),
('contact_email', 'admin@binitayan.gov.ph'),
('contact_phone', '09171234567'),
('emergency_hotline', '911 / Local DRRM Office'),
('default_minimum_level', '10'),
('default_unit', 'pcs');

-- Inventory categories (referenced by relief_items.category)
INSERT INTO inventory_categories (category_name) VALUES
('Food'), ('Water'), ('Hygiene'), ('Medical'), ('Shelter'), ('Other');

-- Disaster types (referenced by disaster_reports.disaster_type)
INSERT INTO disaster_types (type_name) VALUES
('Flood'), ('Typhoon'), ('Landslide'), ('Earthquake'), ('Fire'), ('Other');

SET FOREIGN_KEY_CHECKS = 1;

-- =====================================================================
-- PART B — ADMINISTRATOR ACCOUNT (test password: BinitayanTest2026!)
-- =====================================================================
INSERT INTO users (full_name, email, password, role, is_active, contact_number, created_at)
VALUES ('Barangay Administrator (Test)', 'admin.binitayan.test@gmail.com', '$2y$12$5G4gf6B.yC.p5HwjY9tK7.QlcJTeLFiqcFQxvAZ5vkQtVSo5RRsBG', 'admin', 1, '09000001201', '2026-09-01 08:00:00');

-- =====================================================================
-- PART C — SYNTHETIC DEFENSE DATA
-- =====================================================================
SET NAMES utf8mb4;
-- Same session time zone the application uses (DB_TIME_ZONE '+08:00', Philippine
-- time), so the scenario timestamps below show correctly on any server.
SET time_zone = '+08:00';
START TRANSACTION;

-- ---------------------------------------------------------------------
-- 1. TEST ACCOUNTS (10). The Administrator is inserted first, so an existing
--    defense dataset stops the import before anything else is written.
-- ---------------------------------------------------------------------
-- The Administrator test account is not created by this file. @admin uses the
-- first existing Administrator account (verified_by, issued_by, approved_by...).
SET @admin := (SELECT user_id FROM users WHERE role = 'admin' ORDER BY user_id LIMIT 1);
INSERT INTO users (full_name, email, password, role, is_active, contact_number, created_at) VALUES ('Nestor Valdez', 'personnel.binitayan.test@gmail.com', '$2y$12$jyrNgkuWQ9ZG5.fS9S7Xt.gSvF9xnc6J30i27GlRh1GfMvkqBplHy', 'relief_personnel', 1, '09000001202', '2026-09-01 08:05:00');
SET @personnel := LAST_INSERT_ID();
INSERT INTO users (full_name, email, password, role, is_active, contact_number, created_at) VALUES ('Ramon Dizon', 'binitayan.test01@gmail.com', '$2y$12$KhNGZ3DqGw6HSCkoU40Eg.U9HFFu0b09aybgqaoT9YKOgEj.Vp7.G', 'resident', 1, '09000001101', '2026-09-01 09:01:00');
SET @u_h01 := LAST_INSERT_ID();
INSERT INTO users (full_name, email, password, role, is_active, contact_number, created_at) VALUES ('Gloria Mendoza', 'binitayan.test02@gmail.com', '$2y$12$2BP/rVUgYK4CMAQHlPY2sOwDOE8fa65Y8yE1ZRCi2lD5X84E3rk16', 'resident', 1, '09000001102', '2026-09-01 09:02:00');
SET @u_h02 := LAST_INSERT_ID();
INSERT INTO users (full_name, email, password, role, is_active, contact_number, created_at) VALUES ('Eduardo Salazar', 'binitayan.test03@gmail.com', '$2y$12$GIvELFW6cpZa06BYuSPq6eXPtMo/wMxSmYQ5TSv3SE5jm1Bnum7m2', 'resident', 1, '09000001103', '2026-09-01 09:03:00');
SET @u_h03 := LAST_INSERT_ID();
INSERT INTO users (full_name, email, password, role, is_active, contact_number, created_at) VALUES ('Jerome Pascual', 'binitayan.test04@gmail.com', '$2y$12$z/XOz2bKNj4NU09e.XPtxuqNQ536TM1bY4opan1VZGTBC0sUfl.9G', 'resident', 1, '09000001104', '2026-09-01 09:04:00');
SET @u_h04 := LAST_INSERT_ID();
INSERT INTO users (full_name, email, password, role, is_active, contact_number, created_at) VALUES ('Corazon Villanueva', 'binitayan.test05@gmail.com', '$2y$12$Eii7ZCe78whZNXK4rX1SZO9sDMEel9RgVEE7Nzv5AYZ5F1ES9lzz2', 'resident', 1, '09000001105', '2026-09-01 09:05:00');
SET @u_h05 := LAST_INSERT_ID();
INSERT INTO users (full_name, email, password, role, is_active, contact_number, created_at) VALUES ('Wilfredo Ocampo', 'binitayan.test06@gmail.com', '$2y$12$kvtM4GuBBFeTkBmPhN/Ho.4P6m0yb5e9YmBSoZlcY/LcjBOZxgH8.', 'resident', 1, '09000001106', '2026-09-01 09:06:00');
SET @u_h06 := LAST_INSERT_ID();
INSERT INTO users (full_name, email, password, role, is_active, contact_number, created_at) VALUES ('Leonora Castillo', 'binitayan.test07@gmail.com', '$2y$12$vtsf9L9iwpDvlkLGNO/h.unQrXiNKK49kTOSWX2s4e8fJQWJ4qMDS', 'resident', 1, '09000001107', '2026-09-01 09:07:00');
SET @u_h07 := LAST_INSERT_ID();
INSERT INTO users (full_name, email, password, role, is_active, contact_number, created_at) VALUES ('Ernesto Dimaculangan', 'binitayan.test08@gmail.com', '$2y$12$rapm8BiqldnAQYgWJUU06.Nd9g/3MkECiTMP05trZ/yokP7ZRmQMq', 'resident', 1, '09000001108', '2026-09-01 09:08:00');
SET @u_h08 := LAST_INSERT_ID();

-- ---------------------------------------------------------------------
-- 2. HOUSEHOLDS (8) + MEMBERS. vulnerable_members = children + seniors + PWD
--    + pregnant + medical + other (same formula as add_household.php).
--    Infants are counted in children_count (the schema has no infant column).
--    Coordinates were checked with backend/utils/boundary_validator.php.
-- ---------------------------------------------------------------------
-- H01: Ramon Dizon (Purok 1), 2 members, 0 vulnerable
INSERT INTO households (user_id, head_of_family, purok, address, number_of_members, vulnerable_members, children_count, seniors_count, pwd_count, pregnant_count, medical_needs_count, other_vulnerable_count, contact_number, latitude, longitude, created_at) VALUES (@u_h01, 'Ramon Dizon', 'Purok 1', 'Purok 1, Barangay Binitayan, Daraga, Albay — [DEFENSE TEST] H01', 2, 0, 0, 0, 0, 0, 0, 0, '09000001101', 13.15625, 123.7144696, '2026-09-02 09:01:00');
SET @h_h01 := LAST_INSERT_ID();
INSERT INTO household_members (household_id, full_name, relationship, age, created_at) VALUES
  (@h_h01, 'Ramon Dizon', 'Head of family', 58, '2026-09-02 09:01:00'),
  (@h_h01, 'Lydia Dizon', 'Spouse', 56, '2026-09-02 09:01:00');
-- H02: Gloria Mendoza (Purok 2), 4 members, 1 vulnerable
INSERT INTO households (user_id, head_of_family, purok, address, number_of_members, vulnerable_members, children_count, seniors_count, pwd_count, pregnant_count, medical_needs_count, other_vulnerable_count, contact_number, latitude, longitude, created_at) VALUES (@u_h02, 'Gloria Mendoza', 'Purok 2', 'Purok 2, Barangay Binitayan, Daraga, Albay — [DEFENSE TEST] H02', 4, 1, 0, 1, 0, 0, 0, 0, '09000001102', 13.1556932, 123.7153845, '2026-09-02 09:02:00');
SET @h_h02 := LAST_INSERT_ID();
INSERT INTO household_members (household_id, full_name, relationship, age, created_at) VALUES
  (@h_h02, 'Gloria Mendoza', 'Head of family', 45, '2026-09-02 09:02:00'),
  (@h_h02, 'Ronaldo Mendoza', 'Spouse', 47, '2026-09-02 09:02:00'),
  (@h_h02, 'Kyle Mendoza', 'Son', 19, '2026-09-02 09:02:00'),
  (@h_h02, 'Pacita Rivera', 'Mother (elderly / senior citizen)', 71, '2026-09-02 09:02:00');
-- H03: Eduardo Salazar (Purok 3), 6 members, 2 vulnerable
INSERT INTO households (user_id, head_of_family, purok, address, number_of_members, vulnerable_members, children_count, seniors_count, pwd_count, pregnant_count, medical_needs_count, other_vulnerable_count, contact_number, latitude, longitude, created_at) VALUES (@u_h03, 'Eduardo Salazar', 'Purok 3', 'Purok 3, Barangay Binitayan, Daraga, Albay — [DEFENSE TEST] H03', 6, 2, 1, 0, 1, 0, 0, 0, '09000001103', 13.1571687, 123.7154321, '2026-09-02 09:03:00');
SET @h_h03 := LAST_INSERT_ID();
INSERT INTO household_members (household_id, full_name, relationship, age, created_at) VALUES
  (@h_h03, 'Eduardo Salazar', 'Head of family', 46, '2026-09-02 09:03:00'),
  (@h_h03, 'Marissa Salazar', 'Spouse', 44, '2026-09-02 09:03:00'),
  (@h_h03, 'Joshua Salazar', 'Son (PWD, mobility impairment)', 20, '2026-09-02 09:03:00'),
  (@h_h03, 'Carla Salazar', 'Daughter', 23, '2026-09-02 09:03:00'),
  (@h_h03, 'Bea Salazar', 'Daughter', 18, '2026-09-02 09:03:00'),
  (@h_h03, 'Mika Salazar', 'Granddaughter (infant, 7 months)', 0, '2026-09-02 09:03:00');
-- H04: Jerome Pascual (Purok 4), 5 members, 1 vulnerable
INSERT INTO households (user_id, head_of_family, purok, address, number_of_members, vulnerable_members, children_count, seniors_count, pwd_count, pregnant_count, medical_needs_count, other_vulnerable_count, contact_number, latitude, longitude, created_at) VALUES (@u_h04, 'Jerome Pascual', 'Purok 4', 'Purok 4, Barangay Binitayan, Daraga, Albay — [DEFENSE TEST] H04', 5, 1, 0, 0, 0, 1, 0, 0, '09000001104', 13.156417, 123.7166138, '2026-09-02 09:04:00');
SET @h_h04 := LAST_INSERT_ID();
INSERT INTO household_members (household_id, full_name, relationship, age, created_at) VALUES
  (@h_h04, 'Jerome Pascual', 'Head of family', 31, '2026-09-02 09:04:00'),
  (@h_h04, 'Angelica Pascual', 'Spouse (pregnant, 7 months)', 29, '2026-09-02 09:04:00'),
  (@h_h04, 'Rolando Pascual', 'Father', 56, '2026-09-02 09:04:00'),
  (@h_h04, 'Maricel Pascual', 'Sister', 26, '2026-09-02 09:04:00'),
  (@h_h04, 'Dennis Pascual', 'Brother', 22, '2026-09-02 09:04:00');
-- H05: Corazon Villanueva (Purok 5A), 3 members, 1 vulnerable
INSERT INTO households (user_id, head_of_family, purok, address, number_of_members, vulnerable_members, children_count, seniors_count, pwd_count, pregnant_count, medical_needs_count, other_vulnerable_count, contact_number, latitude, longitude, created_at) VALUES (@u_h05, 'Corazon Villanueva', 'Purok 5A', 'Purok 5A, Barangay Binitayan, Daraga, Albay — [DEFENSE TEST] H05', 3, 1, 0, 1, 0, 0, 0, 0, '09000001105', 13.1574095, 123.7177183, '2026-09-02 09:05:00');
SET @h_h05 := LAST_INSERT_ID();
INSERT INTO household_members (household_id, full_name, relationship, age, created_at) VALUES
  (@h_h05, 'Corazon Villanueva', 'Head of family', 52, '2026-09-02 09:05:00'),
  (@h_h05, 'Andres Villanueva', 'Father-in-law (elderly / senior citizen)', 78, '2026-09-02 09:05:00'),
  (@h_h05, 'Paolo Villanueva', 'Son', 25, '2026-09-02 09:05:00');
-- H06: Wilfredo Ocampo (Purok 5B), 7 members, 2 vulnerable
INSERT INTO households (user_id, head_of_family, purok, address, number_of_members, vulnerable_members, children_count, seniors_count, pwd_count, pregnant_count, medical_needs_count, other_vulnerable_count, contact_number, latitude, longitude, created_at) VALUES (@u_h06, 'Wilfredo Ocampo', 'Purok 5B', 'Purok 5B, Barangay Binitayan, Daraga, Albay — [DEFENSE TEST] H06', 7, 2, 1, 1, 0, 0, 0, 0, '09000001106', 13.1565206, 123.7175852, '2026-09-02 09:06:00');
SET @h_h06 := LAST_INSERT_ID();
INSERT INTO household_members (household_id, full_name, relationship, age, created_at) VALUES
  (@h_h06, 'Wilfredo Ocampo', 'Head of family', 48, '2026-09-02 09:06:00'),
  (@h_h06, 'Rosalinda Ocampo', 'Spouse', 46, '2026-09-02 09:06:00'),
  (@h_h06, 'Esperanza Ocampo', 'Mother (elderly / senior citizen)', 75, '2026-09-02 09:06:00'),
  (@h_h06, 'Mark Ocampo', 'Son', 24, '2026-09-02 09:06:00'),
  (@h_h06, 'Jenny Ocampo', 'Daughter-in-law', 22, '2026-09-02 09:06:00'),
  (@h_h06, 'Ryan Ocampo', 'Son', 19, '2026-09-02 09:06:00'),
  (@h_h06, 'Liam Ocampo', 'Grandson (infant, 1 year)', 1, '2026-09-02 09:06:00');
-- H07: Leonora Castillo (Purok 6), 4 members, 1 vulnerable
INSERT INTO households (user_id, head_of_family, purok, address, number_of_members, vulnerable_members, children_count, seniors_count, pwd_count, pregnant_count, medical_needs_count, other_vulnerable_count, contact_number, latitude, longitude, created_at) VALUES (@u_h07, 'Leonora Castillo', 'Purok 6', 'Purok 6, Barangay Binitayan, Daraga, Albay — [DEFENSE TEST] H07', 4, 1, 0, 0, 1, 0, 0, 0, '09000001107', 13.1574429, 123.7187681, '2026-09-02 09:07:00');
SET @h_h07 := LAST_INSERT_ID();
INSERT INTO household_members (household_id, full_name, relationship, age, created_at) VALUES
  (@h_h07, 'Leonora Castillo', 'Head of family', 40, '2026-09-02 09:07:00'),
  (@h_h07, 'Benjie Castillo', 'Spouse (PWD, wheelchair user)', 43, '2026-09-02 09:07:00'),
  (@h_h07, 'Trisha Castillo', 'Daughter', 19, '2026-09-02 09:07:00'),
  (@h_h07, 'Paul Castillo', 'Son', 18, '2026-09-02 09:07:00');
-- H08: Ernesto Dimaculangan (Purok 7), 8 members, 3 vulnerable
INSERT INTO households (user_id, head_of_family, purok, address, number_of_members, vulnerable_members, children_count, seniors_count, pwd_count, pregnant_count, medical_needs_count, other_vulnerable_count, contact_number, latitude, longitude, created_at) VALUES (@u_h08, 'Ernesto Dimaculangan', 'Purok 7', 'Purok 7, Barangay Binitayan, Daraga, Albay — [DEFENSE TEST] H08', 8, 3, 1, 1, 1, 0, 0, 0, '09000001108', 13.1552189, 123.7169349, '2026-09-02 09:08:00');
SET @h_h08 := LAST_INSERT_ID();
INSERT INTO household_members (household_id, full_name, relationship, age, created_at) VALUES
  (@h_h08, 'Ernesto Dimaculangan', 'Head of family', 51, '2026-09-02 09:08:00'),
  (@h_h08, 'Lorna Dimaculangan', 'Spouse', 49, '2026-09-02 09:08:00'),
  (@h_h08, 'Felipa Dimaculangan', 'Mother (elderly / senior citizen)', 80, '2026-09-02 09:08:00'),
  (@h_h08, 'Ramil Dimaculangan', 'Son (PWD, visual impairment)', 27, '2026-09-02 09:08:00'),
  (@h_h08, 'Joy Dimaculangan', 'Daughter-in-law', 25, '2026-09-02 09:08:00'),
  (@h_h08, 'Kenneth Dimaculangan', 'Son', 21, '2026-09-02 09:08:00'),
  (@h_h08, 'Aira Dimaculangan', 'Daughter', 19, '2026-09-02 09:08:00'),
  (@h_h08, 'Zoe Dimaculangan', 'Granddaughter (infant, 4 months)', 0, '2026-09-02 09:08:00');

-- ---------------------------------------------------------------------
-- 3. RELIEF ITEMS (6) + their initial "Stock In" log, exactly as
--    inventory/add_item.php records an item created with a starting quantity.
--    Categories must already exist in inventory_categories (default rows).
-- ---------------------------------------------------------------------
INSERT INTO relief_items (item_name, category, quantity, unit, minimum_level, expiration_date, date_added) VALUES ('Rice [DEFENSE TEST]', 'Food', 100, 'pack', 20, NULL, '2026-09-20 10:00:00');
SET @i_rice := LAST_INSERT_ID();
INSERT INTO inventory_logs (item_id, log_type, quantity_change, resulting_quantity, reference, performed_by, created_at) VALUES (@i_rice, 'Stock In', 100, 100, 'Initial stock on item creation', @admin, '2026-09-20 10:00:00');
INSERT INTO relief_items (item_name, category, quantity, unit, minimum_level, expiration_date, date_added) VALUES ('Bottled Water [DEFENSE TEST]', 'Water', 120, 'bottle (1 L)', 30, NULL, '2026-09-20 10:00:00');
SET @i_water := LAST_INSERT_ID();
INSERT INTO inventory_logs (item_id, log_type, quantity_change, resulting_quantity, reference, performed_by, created_at) VALUES (@i_water, 'Stock In', 120, 120, 'Initial stock on item creation', @admin, '2026-09-20 10:00:00');
INSERT INTO relief_items (item_name, category, quantity, unit, minimum_level, expiration_date, date_added) VALUES ('Family Food Pack [DEFENSE TEST]', 'Food', 20, 'pack', 10, NULL, '2026-09-20 10:00:00');
SET @i_pack := LAST_INSERT_ID();
INSERT INTO inventory_logs (item_id, log_type, quantity_change, resulting_quantity, reference, performed_by, created_at) VALUES (@i_pack, 'Stock In', 20, 20, 'Initial stock on item creation', @admin, '2026-09-20 10:00:00');
INSERT INTO relief_items (item_name, category, quantity, unit, minimum_level, expiration_date, date_added) VALUES ('Hygiene Kit [DEFENSE TEST]', 'Hygiene', 6, 'kit', 10, NULL, '2026-09-20 10:00:00');
SET @i_hygiene := LAST_INSERT_ID();
INSERT INTO inventory_logs (item_id, log_type, quantity_change, resulting_quantity, reference, performed_by, created_at) VALUES (@i_hygiene, 'Stock In', 6, 6, 'Initial stock on item creation', @admin, '2026-09-20 10:00:00');
INSERT INTO relief_items (item_name, category, quantity, unit, minimum_level, expiration_date, date_added) VALUES ('Blanket [DEFENSE TEST]', 'Shelter', 10, 'pc', 5, NULL, '2026-09-20 10:00:00');
SET @i_blanket := LAST_INSERT_ID();
INSERT INTO inventory_logs (item_id, log_type, quantity_change, resulting_quantity, reference, performed_by, created_at) VALUES (@i_blanket, 'Stock In', 10, 10, 'Initial stock on item creation', @admin, '2026-09-20 10:00:00');
INSERT INTO relief_items (item_name, category, quantity, unit, minimum_level, expiration_date, date_added) VALUES ('First Aid Kit [DEFENSE TEST]', 'Medical', 4, 'kit', 5, NULL, '2026-09-20 10:00:00');
SET @i_firstaid := LAST_INSERT_ID();
INSERT INTO inventory_logs (item_id, log_type, quantity_change, resulting_quantity, reference, performed_by, created_at) VALUES (@i_firstaid, 'Stock In', 4, 4, 'Initial stock on item creation', @admin, '2026-09-20 10:00:00');

-- ---------------------------------------------------------------------
-- 4. EVACUATION CENTER (1) + the "Center added" history row that
--    evacuation/save_center.php writes when a center is created.
-- ---------------------------------------------------------------------
INSERT INTO evacuation_centers (name, address, purok, latitude, longitude, capacity, current_occupancy, facilities, contact_person, contact_number, status, created_by, updated_by, created_at, updated_at) VALUES ('Binitayan Defense Demonstration Evacuation Center', 'Purok 3, Barangay Binitayan, Daraga, Albay [DEFENSE TEST]', 'Purok 3', 13.15529, 123.7163065, 50, 18, 'Water, Restrooms, Electricity, First Aid, Sleeping Area', 'Kagawad on duty (Defense Test)', '09000001301', 'Open', @admin, @admin, '2026-09-28 20:00:00', '2026-09-28 20:00:00');
SET @center := LAST_INSERT_ID();
INSERT INTO evacuation_center_logs (center_id, previous_occupancy, new_occupancy, previous_status, new_status, remarks, changed_by, changed_at) VALUES (@center, NULL, 18, NULL, 'Open', 'Center added', @admin, '2026-09-28 20:00:00');

-- ---------------------------------------------------------------------
-- 4b. DISTRIBUTION SITE: relief package + distribution schedule at the SAME
--     place and coordinates as the evacuation center (13.15529, 123.7163065).
--     Same columns as relief/packages/add_package.php and
--     relief/schedules/add_schedule.php. Date = the day after you import, 9:00 AM,
--     so it always shows as an upcoming distribution.
--     Beneficiaries H02, H05, H06 are Pending: Relief Personnel can demonstrate
--     Prepared -> Dispatched -> Verify -> Delivered live (stock is deducted only
--     when a beneficiary is marked Delivered).
-- ---------------------------------------------------------------------
INSERT INTO relief_packages (package_name, description, is_active, created_by, created_at) VALUES ('Family Relief Pack [DEFENSE TEST]', '1 family food pack, 6 bottles of water and 2 packs of rice per household. [DEFENSE TEST]', 1, @admin, '2026-09-30 10:00:00');
SET @package := LAST_INSERT_ID();
INSERT INTO relief_package_items (package_id, item_id, quantity) VALUES
  (@package, @i_pack, 1),
  (@package, @i_water, 6),
  (@package, @i_rice, 2);
INSERT INTO distribution_schedules (package_id, distribution_date, distribution_time, location, latitude, longitude, assigned_personnel, notes, created_by, created_at) VALUES (@package, CURDATE() + INTERVAL 1 DAY, '09:00:00', 'Binitayan Defense Demonstration Evacuation Center, Purok 3', 13.15529, 123.7163065, @personnel, 'Typhoon Binitayan Relief Distribution – Batch 1 (distribution site at the evacuation center) [DEFENSE TEST]', @admin, '2026-09-30 10:05:00');
SET @schedule := LAST_INSERT_ID();
INSERT INTO distribution_beneficiaries (schedule_id, household_id, status) VALUES
  (@schedule, @h_h02, 'Pending'),
  (@schedule, @h_h05, 'Pending'),
  (@schedule, @h_h06, 'Pending');

-- ---------------------------------------------------------------------
-- 5. HAZARD ALERTS (3) + WEATHER LOGS (3, manual). Active alerts feed the
--    DSS location factor: Purok 7 and Purok 5A flood alerts are active;
--    the barangay-wide typhoon alert is resolved (it no longer adds points).
--    Disaster types used in this dataset: Typhoon and Flood only.
--    No prediction data is created.
-- ---------------------------------------------------------------------
INSERT INTO hazard_alerts (hazard_type, status, title, description, affected_purok, is_active, issued_by, issued_at, resolved_by, resolved_at) VALUES ('Typhoon', 'Critical', 'Typhoon Binitayan Defense Demonstration 2026 — strong winds and heavy rainfall', 'A simulated strong typhoon affected Barangay Binitayan, Daraga, Albay, resulting in flooding, property damage, temporary displacement, and increased demand for emergency relief resources. Strong winds and heavy rainfall expected. Secure roofs, stay indoors and prepare to evacuate if instructed. [DEFENSE TEST]', NULL, 0, @admin, '2026-09-28 12:00:00', @admin, '2026-09-30 08:00:00');
INSERT INTO hazard_alerts (hazard_type, status, title, description, affected_purok, is_active, issued_by, issued_at, resolved_by, resolved_at) VALUES ('Flood', 'Critical', 'Flooding in low-lying areas — Purok 7 riverside', 'Simulated flooding reported in low-lying areas of Barangay Binitayan following Typhoon Binitayan Defense Demonstration 2026. Floodwater remains high near the river in Purok 7; residents should stay away from the riverbank. [DEFENSE TEST]', 'Purok 7', 1, @admin, '2026-09-29 06:00:00', NULL, NULL);
INSERT INTO hazard_alerts (hazard_type, status, title, description, affected_purok, is_active, issued_by, issued_at, resolved_by, resolved_at) VALUES ('Flood', 'Warning', 'Flash flooding along the Purok 5A hillside drainage', 'Runoff from the hillside drainage keeps flooding houses in Purok 5A after the heavy rainfall. Move belongings to higher places and avoid the drainage canal. [DEFENSE TEST]', 'Purok 5A', 1, @admin, '2026-09-29 07:45:00', NULL, NULL);
INSERT INTO weather_logs (log_date, log_time, temperature, rainfall_mm, weather_condition, wind_speed_kph, wind_direction, source, remarks, recorded_by, created_at) VALUES ('2026-09-28', '15:00:00', 24.5, 86.0, 'Stormy', 110.0, 'NE', 'Manual', 'Typhoon passing near Albay: strong winds and heavy rainfall (manual log, simulated). [DEFENSE TEST]', @admin, '2026-09-28 15:00:00');
INSERT INTO weather_logs (log_date, log_time, temperature, rainfall_mm, weather_condition, wind_speed_kph, wind_direction, source, remarks, recorded_by, created_at) VALUES ('2026-09-29', '09:00:00', 25.0, 38.0, 'Rainy', 45.0, 'N', 'Manual', 'Continuous rain after the typhoon (manual log, simulated). [DEFENSE TEST]', @admin, '2026-09-29 09:00:00');
INSERT INTO weather_logs (log_date, log_time, temperature, rainfall_mm, weather_condition, wind_speed_kph, wind_direction, source, remarks, recorded_by, created_at) VALUES ('2026-09-30', '09:00:00', 27.5, 4.0, 'Cloudy', 15.0, 'E', 'Manual', 'Rain has stopped; flooding remains in low-lying puroks (manual log, simulated). [DEFENSE TEST]', @admin, '2026-09-30 09:00:00');

-- ---------------------------------------------------------------------
-- 6. DISASTER REPORTS (8, Typhoon or Flood only, one per household; H01–H07 Verified,
--    H08 Pending) + DAMAGE ASSESSMENTS (8). No photos (no files exist).
--    Note: estimated_severity is stored and shown, but the DSS does not use it.
-- ---------------------------------------------------------------------
INSERT INTO disaster_reports (user_id, household_id, disaster_type, location, description, report_date, report_time, severity, status, verified_by, verified_at, verification_remarks, created_at) VALUES (@u_h01, @h_h01, 'Flood', 'Purok 1, near the drainage canal', '[DEFENSE TEST] Typhoon Binitayan Defense Demonstration 2026: Heavy rain flooded the yard ankle-deep. No water entered the house; part of the bamboo fence and some plants were damaged.', '2026-09-28', '16:20:00', 'Low', 'Verified', @admin, '2026-09-29 16:00:00', 'Checked during the purok inspection. Minor yard damage only.', '2026-09-28 16:20:00');
SET @r_h01 := LAST_INSERT_ID();
INSERT INTO damage_assessments (report_id, house_damage, infrastructure_damage, property_damage, agricultural_damage, estimated_severity, remarks, assessed_by, assessed_at) VALUES (@r_h01, 'Minor', 'None', 'None', 'Minor', 'Low', 'Minor: fence and garden plants damaged; house not affected. [DEFENSE TEST]', @admin, '2026-09-29 16:30:00');
INSERT INTO disaster_reports (user_id, household_id, disaster_type, location, description, report_date, report_time, severity, status, verified_by, verified_at, verification_remarks, created_at) VALUES (@u_h02, @h_h02, 'Typhoon', 'Purok 2, along the barangay road', '[DEFENSE TEST] Typhoon Binitayan Defense Demonstration 2026: Strong winds lifted several roof sheets (roof partially damaged). Rainwater leaked into the living area and wet clothes and school supplies.', '2026-09-28', '17:05:00', 'Medium', 'Verified', @admin, '2026-09-29 16:00:00', 'Roof damage confirmed by the BDRRM team.', '2026-09-28 17:05:00');
SET @r_h02 := LAST_INSERT_ID();
INSERT INTO damage_assessments (report_id, house_damage, infrastructure_damage, property_damage, agricultural_damage, estimated_severity, remarks, assessed_by, assessed_at) VALUES (@r_h02, 'Minor', 'None', 'Minor', 'None', 'Medium', 'Moderate overall (recorded as Minor house + Minor property, because the system has no "Moderate" level): roof sheets loosened, some belongings wet. [DEFENSE TEST]', @admin, '2026-09-29 16:30:00');
INSERT INTO disaster_reports (user_id, household_id, disaster_type, location, description, report_date, report_time, severity, status, verified_by, verified_at, verification_remarks, created_at) VALUES (@u_h03, @h_h03, 'Flood', 'Purok 3, low-lying area', '[DEFENSE TEST] Typhoon Binitayan Defense Demonstration 2026: Floodwater entered the household and rose to about waist level. The refrigerator, rice cooker and stored food were damaged. The family stayed with relatives for two nights and requires food and clean water.', '2026-09-28', '18:40:00', 'High', 'Verified', @admin, '2026-09-29 16:00:00', 'Flood damage confirmed; household needs food and clean water.', '2026-09-28 18:40:00');
SET @r_h03 := LAST_INSERT_ID();
INSERT INTO damage_assessments (report_id, house_damage, infrastructure_damage, property_damage, agricultural_damage, estimated_severity, remarks, assessed_by, assessed_at) VALUES (@r_h03, 'Major', 'None', 'Major', 'None', 'High', 'Major: flood damaged kitchen, appliances and stored food. [DEFENSE TEST]', @admin, '2026-09-29 16:30:00');
INSERT INTO disaster_reports (user_id, household_id, disaster_type, location, description, report_date, report_time, severity, status, verified_by, verified_at, verification_remarks, created_at) VALUES (@u_h04, @h_h04, 'Typhoon', 'Purok 4, upper side', '[DEFENSE TEST] Typhoon Binitayan Defense Demonstration 2026: The roof was blown off and a side wall collapsed during the strongest winds. The house is not safe to stay in; the household is temporarily displaced at the evacuation center. One member is pregnant.', '2026-09-28', '19:15:00', 'Critical', 'Verified', @admin, '2026-09-29 16:00:00', 'Severe damage confirmed on site. Family is at the evacuation center.', '2026-09-28 19:15:00');
SET @r_h04 := LAST_INSERT_ID();
INSERT INTO damage_assessments (report_id, house_damage, infrastructure_damage, property_damage, agricultural_damage, estimated_severity, remarks, assessed_by, assessed_at) VALUES (@r_h04, 'Totally Damaged', 'Minor', 'Totally Damaged', 'None', 'Critical', 'Total: roof gone and side wall collapsed; house not habitable. [DEFENSE TEST]', @admin, '2026-09-29 16:30:00');
INSERT INTO disaster_reports (user_id, household_id, disaster_type, location, description, report_date, report_time, severity, status, verified_by, verified_at, verification_remarks, created_at) VALUES (@u_h05, @h_h05, 'Flood', 'Purok 5A hillside', '[DEFENSE TEST] Typhoon Binitayan Defense Demonstration 2026: Runoff from the hillside drainage flooded the kitchen ankle-deep. Mud entered the kitchen and a small part of the back wall cracked from the water.', '2026-09-29', '07:30:00', 'Medium', 'Verified', @admin, '2026-09-29 16:00:00', 'Kitchen flooding and wall crack confirmed.', '2026-09-29 07:30:00');
SET @r_h05 := LAST_INSERT_ID();
INSERT INTO damage_assessments (report_id, house_damage, infrastructure_damage, property_damage, agricultural_damage, estimated_severity, remarks, assessed_by, assessed_at) VALUES (@r_h05, 'Minor', 'None', 'Minor', 'None', 'Medium', 'Minor: floodwater and mud in kitchen, small crack on back wall. [DEFENSE TEST]', @admin, '2026-09-29 16:30:00');
INSERT INTO disaster_reports (user_id, household_id, disaster_type, location, description, report_date, report_time, severity, status, verified_by, verified_at, verification_remarks, created_at) VALUES (@u_h06, @h_h06, 'Typhoon', 'Purok 5B, interior lot', '[DEFENSE TEST] Typhoon Binitayan Defense Demonstration 2026: Floodwater entered the house and a fallen tree damaged the kitchen roof. The water pump stopped working, so the water supply is affected.', '2026-09-29', '08:10:00', 'High', 'Verified', @admin, '2026-09-29 16:00:00', 'Confirmed; kitchen roof and water pump damaged.', '2026-09-29 08:10:00');
SET @r_h06 := LAST_INSERT_ID();
INSERT INTO damage_assessments (report_id, house_damage, infrastructure_damage, property_damage, agricultural_damage, estimated_severity, remarks, assessed_by, assessed_at) VALUES (@r_h06, 'Major', 'Major', 'Minor', 'None', 'High', 'Major: kitchen roof broken by fallen tree; water pump not working. [DEFENSE TEST]', @admin, '2026-09-29 16:30:00');
INSERT INTO disaster_reports (user_id, household_id, disaster_type, location, description, report_date, report_time, severity, status, verified_by, verified_at, verification_remarks, created_at) VALUES (@u_h07, @h_h07, 'Typhoon', 'Purok 6, near the chapel', '[DEFENSE TEST] Typhoon Binitayan Defense Demonstration 2026: Most of the roof and the kitchen were destroyed by the typhoon; furniture and appliances were soaked and the sleeping area was damaged. A family member uses a wheelchair and needs a safe place to stay.', '2026-09-29', '09:00:00', 'Critical', 'Verified', @admin, '2026-09-29 16:00:00', 'House largely destroyed; family member with disability confirmed.', '2026-09-29 09:00:00');
SET @r_h07 := LAST_INSERT_ID();
INSERT INTO damage_assessments (report_id, house_damage, infrastructure_damage, property_damage, agricultural_damage, estimated_severity, remarks, assessed_by, assessed_at) VALUES (@r_h07, 'Totally Damaged', 'None', 'Major', 'None', 'Critical', 'Major/Total: most of the roof and kitchen destroyed; appliances soaked. [DEFENSE TEST]', @admin, '2026-09-29 16:30:00');
INSERT INTO disaster_reports (user_id, household_id, disaster_type, location, description, report_date, report_time, severity, status, verified_by, verified_at, verification_remarks, created_at) VALUES (@u_h08, @h_h08, 'Flood', 'Purok 7, riverside', '[DEFENSE TEST] Typhoon Binitayan Defense Demonstration 2026: The nearby river overflowed. Floodwater reached chest level in the house, damaged appliances and destroyed the backyard vegetable garden. The elderly, PWD and infant members moved to a relative''s house. The household requires food, water and hygiene supplies.', '2026-09-29', '10:25:00', 'High', 'Pending', NULL, NULL, NULL, '2026-09-29 10:25:00');
SET @r_h08 := LAST_INSERT_ID();
INSERT INTO damage_assessments (report_id, house_damage, infrastructure_damage, property_damage, agricultural_damage, estimated_severity, remarks, assessed_by, assessed_at) VALUES (@r_h08, 'Major', 'None', 'Major', 'Major', 'High', 'Major: house flooded to chest level; vegetable garden destroyed. [DEFENSE TEST]', @admin, '2026-09-29 16:30:00');

-- ---------------------------------------------------------------------
-- 7. RELIEF REQUESTS (4) + REQUEST ITEMS + APPROVED ALLOCATIONS.
--    H03, H04, H07: reviewed, decided and processed by the Administrator
--    -> request status 'Allocated', allocations 'Approved' (stock RESERVED,
--    not deducted), the same rows requests/process_request.php creates.
--    Nothing is Distributed: do the distribution live in the defense.
--    H08: Pending (not reviewed) for the live DSS review; it shows the
--    Hygiene Kit shortage (requested 5, available 2).
-- ---------------------------------------------------------------------
-- H03: High urgency, Approved -> Allocated
INSERT INTO relief_requests (household_id, user_id, report_id, urgency, reason, status, admin_remarks, reviewed_by, reviewed_at, processed_by, processed_at, created_at, updated_at) VALUES (@h_h03, @u_h03, @r_h03, 'High', 'Our kitchen was flooded and our stored food and drinking water were spoiled. We need food packs and clean water. [DEFENSE TEST]', 'Allocated', 'Approved in full. [DEFENSE TEST]', @admin, '2026-09-30 09:00:00', @admin, '2026-09-30 09:30:00', '2026-09-29 18:00:00', '2026-09-30 09:30:00');
SET @q_h03 := LAST_INSERT_ID();
INSERT INTO relief_request_items (request_id, item_id, requested_quantity, approved_quantity) VALUES (@q_h03, @i_pack, 3, 3);
SET @ri := LAST_INSERT_ID();
INSERT INTO relief_allocations (household_id, item_id, schedule_id, request_item_id, quantity, status, approved_by, approved_at, recommendation_reason, allocation_date) VALUES (@h_h03, @i_pack, NULL, @ri, 3, 'Approved', @admin, '2026-09-30 09:30:00', CONCAT('Relief request #', @q_h03, ' (High urgency): resident requested 3 pack, Administrator approved 3 pack. [DEFENSE TEST] Loaded by DEFENSE_TEST_DATA.sql; the DSS priority is calculated live by the application.'), '2026-09-30');
INSERT INTO relief_request_items (request_id, item_id, requested_quantity, approved_quantity) VALUES (@q_h03, @i_water, 12, 12);
SET @ri := LAST_INSERT_ID();
INSERT INTO relief_allocations (household_id, item_id, schedule_id, request_item_id, quantity, status, approved_by, approved_at, recommendation_reason, allocation_date) VALUES (@h_h03, @i_water, NULL, @ri, 12, 'Approved', @admin, '2026-09-30 09:30:00', CONCAT('Relief request #', @q_h03, ' (High urgency): resident requested 12 bottle (1 L), Administrator approved 12 bottle (1 L). [DEFENSE TEST] Loaded by DEFENSE_TEST_DATA.sql; the DSS priority is calculated live by the application.'), '2026-09-30');
-- H04: Critical urgency, Approved -> Allocated
INSERT INTO relief_requests (household_id, user_id, report_id, urgency, reason, status, admin_remarks, reviewed_by, reviewed_at, processed_by, processed_at, created_at, updated_at) VALUES (@h_h04, @u_h04, @r_h04, 'Critical', 'Our house was destroyed and we are at the evacuation center with a pregnant family member. We need food, water and hygiene kits. [DEFENSE TEST]', 'Allocated', 'Approved in full: house destroyed, pregnant member at the evacuation center. [DEFENSE TEST]', @admin, '2026-09-30 09:10:00', @admin, '2026-09-30 09:35:00', '2026-09-29 18:10:00', '2026-09-30 09:35:00');
SET @q_h04 := LAST_INSERT_ID();
INSERT INTO relief_request_items (request_id, item_id, requested_quantity, approved_quantity) VALUES (@q_h04, @i_pack, 4, 4);
SET @ri := LAST_INSERT_ID();
INSERT INTO relief_allocations (household_id, item_id, schedule_id, request_item_id, quantity, status, approved_by, approved_at, recommendation_reason, allocation_date) VALUES (@h_h04, @i_pack, NULL, @ri, 4, 'Approved', @admin, '2026-09-30 09:35:00', CONCAT('Relief request #', @q_h04, ' (Critical urgency): resident requested 4 pack, Administrator approved 4 pack. [DEFENSE TEST] Loaded by DEFENSE_TEST_DATA.sql; the DSS priority is calculated live by the application.'), '2026-09-30');
INSERT INTO relief_request_items (request_id, item_id, requested_quantity, approved_quantity) VALUES (@q_h04, @i_hygiene, 2, 2);
SET @ri := LAST_INSERT_ID();
INSERT INTO relief_allocations (household_id, item_id, schedule_id, request_item_id, quantity, status, approved_by, approved_at, recommendation_reason, allocation_date) VALUES (@h_h04, @i_hygiene, NULL, @ri, 2, 'Approved', @admin, '2026-09-30 09:35:00', CONCAT('Relief request #', @q_h04, ' (Critical urgency): resident requested 2 kit, Administrator approved 2 kit. [DEFENSE TEST] Loaded by DEFENSE_TEST_DATA.sql; the DSS priority is calculated live by the application.'), '2026-09-30');
INSERT INTO relief_request_items (request_id, item_id, requested_quantity, approved_quantity) VALUES (@q_h04, @i_water, 18, 18);
SET @ri := LAST_INSERT_ID();
INSERT INTO relief_allocations (household_id, item_id, schedule_id, request_item_id, quantity, status, approved_by, approved_at, recommendation_reason, allocation_date) VALUES (@h_h04, @i_water, NULL, @ri, 18, 'Approved', @admin, '2026-09-30 09:35:00', CONCAT('Relief request #', @q_h04, ' (Critical urgency): resident requested 18 bottle (1 L), Administrator approved 18 bottle (1 L). [DEFENSE TEST] Loaded by DEFENSE_TEST_DATA.sql; the DSS priority is calculated live by the application.'), '2026-09-30');
-- H07: Critical urgency, Partially Approved -> Allocated
INSERT INTO relief_requests (household_id, user_id, report_id, urgency, reason, status, admin_remarks, reviewed_by, reviewed_at, processed_by, processed_at, created_at, updated_at) VALUES (@h_h07, @u_h07, @r_h07, 'Critical', 'Our house and kitchen were destroyed. We need food and hygiene kits; my husband uses a wheelchair. [DEFENSE TEST]', 'Allocated', 'Approved 2 of 3 hygiene kits to keep stock for other affected households. [DEFENSE TEST]', @admin, '2026-09-30 09:20:00', @admin, '2026-09-30 09:40:00', '2026-09-29 18:20:00', '2026-09-30 09:40:00');
SET @q_h07 := LAST_INSERT_ID();
INSERT INTO relief_request_items (request_id, item_id, requested_quantity, approved_quantity) VALUES (@q_h07, @i_pack, 3, 3);
SET @ri := LAST_INSERT_ID();
INSERT INTO relief_allocations (household_id, item_id, schedule_id, request_item_id, quantity, status, approved_by, approved_at, recommendation_reason, allocation_date) VALUES (@h_h07, @i_pack, NULL, @ri, 3, 'Approved', @admin, '2026-09-30 09:40:00', CONCAT('Relief request #', @q_h07, ' (Critical urgency): resident requested 3 pack, Administrator approved 3 pack. [DEFENSE TEST] Loaded by DEFENSE_TEST_DATA.sql; the DSS priority is calculated live by the application.'), '2026-09-30');
INSERT INTO relief_request_items (request_id, item_id, requested_quantity, approved_quantity) VALUES (@q_h07, @i_hygiene, 3, 2);
SET @ri := LAST_INSERT_ID();
INSERT INTO relief_allocations (household_id, item_id, schedule_id, request_item_id, quantity, status, approved_by, approved_at, recommendation_reason, allocation_date) VALUES (@h_h07, @i_hygiene, NULL, @ri, 2, 'Approved', @admin, '2026-09-30 09:40:00', CONCAT('Relief request #', @q_h07, ' (Critical urgency): resident requested 3 kit, Administrator approved 2 kit. [DEFENSE TEST] Loaded by DEFENSE_TEST_DATA.sql; the DSS priority is calculated live by the application.'), '2026-09-30');
-- H08: High urgency, Pending
INSERT INTO relief_requests (household_id, user_id, report_id, urgency, reason, status, admin_remarks, reviewed_by, reviewed_at, processed_by, processed_at, created_at, updated_at) VALUES (@h_h08, @u_h08, @r_h08, 'High', 'The river flooded our house up to chest level. We need food, drinking water and hygiene kits for 8 members, including an infant. [DEFENSE TEST]', 'Pending', NULL, NULL, NULL, NULL, NULL, '2026-09-30 07:30:00', '2026-09-30 07:30:00');
SET @q_h08 := LAST_INSERT_ID();
INSERT INTO relief_request_items (request_id, item_id, requested_quantity, approved_quantity) VALUES (@q_h08, @i_pack, 5, NULL);
INSERT INTO relief_request_items (request_id, item_id, requested_quantity, approved_quantity) VALUES (@q_h08, @i_water, 24, NULL);
INSERT INTO relief_request_items (request_id, item_id, requested_quantity, approved_quantity) VALUES (@q_h08, @i_hygiene, 5, NULL);


-- ---------------------------------------------------------------------
-- Phase 23: immediate needs recorded with each report (shown in Hazard
-- Monitoring). The DSS does not read this column, so scores are unchanged.
-- H01 (minor yard damage) records no immediate need.
-- ---------------------------------------------------------------------
UPDATE disaster_reports SET reported_needs = 'Shelter,Clothing' WHERE report_id = @r_h02;
UPDATE disaster_reports SET reported_needs = 'Food,Water' WHERE report_id = @r_h03;
UPDATE disaster_reports SET reported_needs = 'Shelter,Food,Medical' WHERE report_id = @r_h04;
UPDATE disaster_reports SET reported_needs = 'Hygiene' WHERE report_id = @r_h05;
UPDATE disaster_reports SET reported_needs = 'Water,Shelter' WHERE report_id = @r_h06;
UPDATE disaster_reports SET reported_needs = 'Food,Hygiene,Shelter' WHERE report_id = @r_h07;
UPDATE disaster_reports SET reported_needs = 'Food,Water,Hygiene,Medical' WHERE report_id = @r_h08;

COMMIT;

-- Done. Open the system and let the application calculate the DSS results
-- (Administrator -> Priority Assessment / Relief Recommendations). 
-- =========================================================
-- BARANGAY BINITAYAN — WEB-BASED POST-DISASTER MONITORING AND RELIEF
-- ALLOCATION WITH DECISION SUPPORT SYSTEM
--
-- barangay_disaster_db_FINAL.sql
-- FINAL PRODUCTION DATABASE STRUCTURE (Phases 1–25 consolidated)
--
-- Source of truth: database/barangay_disaster_db_complete.sql (Phase 17
-- consolidation, verified against the base schema plus every migration)
-- database/migration_phase18_recommendation_rejections.sql,
-- database/migration_phase19_redesign.sql (Phase 19 capstone redesign) and
-- database/migration_phase20_automation.sql (Phase 20 panel-requested automation) and
-- database/migration_phase21_resident_scope.sql (Phase 21 resident role correction) and
-- database/migration_phase23_core_modules.sql (Phase 23 six core modules) and
-- database/migration_phase25_official_assessment_dss_allocation.sql (Phase 25). Phases 22 and 24 have no schema change.
--
-- WHAT IT CONTAINS
--   * 33 tables, in foreign-key dependency order
--   * all primary keys, unique keys, indexes and foreign keys
--   * essential default configuration only (marked DEFAULT RECORDS below):
--     system settings, inventory categories, disaster types
--
-- WHAT IT DOES NOT CONTAIN
--   * no CREATE DATABASE / DROP / USE / GRANT / DEFINER statements
--   * no user accounts (create the first Administrator with
--     `php backend/setup_admin.php`), no demo or test data, no relief items
--
-- HOW TO IMPORT (Hostinger or XAMPP)
--   1. Create an EMPTY database (Hostinger: hPanel -> Databases -> MySQL
--      Databases; XAMPP: phpMyAdmin -> New).
--   2. phpMyAdmin -> select that database -> Import -> choose this file -> Go.
--   3. Put the database name, user and password in
--      backend/config/app_config.local.php (copy app_config.local.example.php).
--   4. Create the first Administrator: php backend/setup_admin.php
--   Importing into a database that already has these tables will stop with
--   "table already exists"; existing databases should use the migration files.
-- =========================================================

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

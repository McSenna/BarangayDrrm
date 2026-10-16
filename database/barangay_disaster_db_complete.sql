-- =========================================================
-- BARANGAY BINITAYAN — POST-DISASTER MONITORING AND RELIEF ALLOCATION
-- WITH DECISION SUPPORT SYSTEM
--
-- barangay_disaster_db_complete.sql
-- AUTHORITATIVE FRESH-INSTALL DATABASE (Phase 17 final consolidation)
--
-- This single file creates the complete, current database structure:
--   * all 25 tables, columns, primary keys, unique keys and indexes
--   * all foreign keys with their final ON DELETE / ON UPDATE rules
--   * the Phase 16 improvements already built in (performance indexes,
--     disaster_type / category lookup foreign keys, and ON DELETE RESTRICT
--     protection of relief, inventory, donation and delivery history)
--   * default configuration / seed data
--
-- No migration file needs to be run after importing this file.
-- (The migration_phase*.sql files are kept only for upgrading an OLD
--  database that was imported before those phases existed.)
--
-- HOW TO INSTALL (fresh database):
--   1. phpMyAdmin -> Import -> choose this file -> Go.
--      (It creates the `barangay_disaster_db` database itself. Import it into
--       a server that does NOT already have that database — it never drops
--       or overwrites existing tables.)
--   2. From XAMPP Shell, in the project folder, create the first admin:
--          php backend/setup_admin.php
--   3. Log in with the one-time random password it prints.
--   4. Change that password immediately: My Profile -> Change Password.
--
-- No user accounts are included (no admin, no demo users, no default
-- password), and no transactional/demo data (reports, allocations,
-- schedules, deliveries, audit or inventory logs).
-- =========================================================

CREATE DATABASE IF NOT EXISTS barangay_disaster_db
  CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
USE barangay_disaster_db;

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------
-- TABLES (final structure, alphabetical order)
-- ---------------------------------------------------------

/*M!999999\- enable the sandbox mode */ 
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
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
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
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
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `delivery_report_photos` (
  `photo_id` int(11) NOT NULL AUTO_INCREMENT,
  `report_id` int(11) NOT NULL,
  `file_path` varchar(255) NOT NULL,
  `uploaded_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`photo_id`),
  KEY `report_id` (`report_id`),
  CONSTRAINT `delivery_report_photos_ibfk_1` FOREIGN KEY (`report_id`) REFERENCES `delivery_reports` (`report_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
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
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `disaster_reports` (
  `report_id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `household_id` int(11) DEFAULT NULL,
  `disaster_type` varchar(50) NOT NULL,
  `location` varchar(255) NOT NULL,
  `description` text DEFAULT NULL,
  `report_date` date NOT NULL,
  `report_time` time DEFAULT NULL,
  `severity` enum('Low','Medium','High','Critical') NOT NULL,
  `status` enum('Pending','Verified','Rejected') NOT NULL DEFAULT 'Pending',
  `verified_by` int(11) DEFAULT NULL,
  `verified_at` timestamp NULL DEFAULT NULL,
  `verification_remarks` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`report_id`),
  KEY `user_id` (`user_id`),
  KEY `household_id` (`household_id`),
  KEY `verified_by` (`verified_by`),
  KEY `idx_disaster_reports_status` (`status`),
  KEY `idx_disaster_reports_severity` (`severity`),
  KEY `fk_disaster_reports_disaster_type` (`disaster_type`),
  CONSTRAINT `disaster_reports_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE,
  CONSTRAINT `disaster_reports_ibfk_2` FOREIGN KEY (`household_id`) REFERENCES `households` (`household_id`) ON DELETE SET NULL,
  CONSTRAINT `disaster_reports_ibfk_3` FOREIGN KEY (`verified_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_disaster_reports_disaster_type` FOREIGN KEY (`disaster_type`) REFERENCES `disaster_types` (`type_name`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `disaster_types` (
  `type_id` int(11) NOT NULL AUTO_INCREMENT,
  `type_name` varchar(50) NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`type_id`),
  UNIQUE KEY `type_name` (`type_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
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
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `distribution_schedules` (
  `schedule_id` int(11) NOT NULL AUTO_INCREMENT,
  `package_id` int(11) NOT NULL,
  `distribution_date` date NOT NULL,
  `distribution_time` time DEFAULT NULL,
  `location` varchar(255) NOT NULL,
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
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
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
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
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
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
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
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
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
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `inventory_categories` (
  `category_id` int(11) NOT NULL AUTO_INCREMENT,
  `category_name` varchar(50) NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`category_id`),
  UNIQUE KEY `category_name` (`category_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
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
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
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
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `relief_allocations` (
  `allocation_id` int(11) NOT NULL AUTO_INCREMENT,
  `household_id` int(11) NOT NULL,
  `item_id` int(11) NOT NULL,
  `schedule_id` int(11) DEFAULT NULL,
  `quantity` int(11) NOT NULL,
  `status` enum('Pending','Approved','Distributed') NOT NULL DEFAULT 'Pending',
  `approved_by` int(11) DEFAULT NULL,
  `approved_at` timestamp NULL DEFAULT NULL,
  `recommendation_reason` text DEFAULT NULL,
  `allocation_date` date NOT NULL,
  `distributed_by` int(11) DEFAULT NULL,
  `distributed_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`allocation_id`),
  KEY `schedule_id` (`schedule_id`),
  KEY `approved_by` (`approved_by`),
  KEY `distributed_by` (`distributed_by`),
  KEY `idx_relief_allocations_status` (`status`),
  KEY `fk_relief_allocations_household` (`household_id`),
  KEY `fk_relief_allocations_item` (`item_id`),
  CONSTRAINT `fk_relief_allocations_household` FOREIGN KEY (`household_id`) REFERENCES `households` (`household_id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_relief_allocations_item` FOREIGN KEY (`item_id`) REFERENCES `relief_items` (`item_id`) ON DELETE RESTRICT,
  CONSTRAINT `relief_allocations_ibfk_3` FOREIGN KEY (`schedule_id`) REFERENCES `distribution_schedules` (`schedule_id`) ON DELETE SET NULL,
  CONSTRAINT `relief_allocations_ibfk_4` FOREIGN KEY (`approved_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `relief_allocations_ibfk_5` FOREIGN KEY (`distributed_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
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
  CONSTRAINT `fk_relief_items_category` FOREIGN KEY (`category`) REFERENCES `inventory_categories` (`category_name`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
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
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
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
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
-- Phase 18: Administrator rejections of computed relief recommendations
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
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `report_photos` (
  `photo_id` int(11) NOT NULL AUTO_INCREMENT,
  `report_id` int(11) NOT NULL,
  `file_path` varchar(255) NOT NULL,
  `uploaded_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`photo_id`),
  KEY `report_id` (`report_id`),
  CONSTRAINT `report_photos_ibfk_1` FOREIGN KEY (`report_id`) REFERENCES `disaster_reports` (`report_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `sms_logs` (
  `sms_id` int(11) NOT NULL AUTO_INCREMENT,
  `recipient_type` enum('Resident','Relief Personnel','Household','Custom') NOT NULL,
  `recipient_name` varchar(150) DEFAULT NULL,
  `recipient_number` varchar(20) NOT NULL,
  `message` text NOT NULL,
  `category` enum('Emergency Warning','Disaster Alert','Evacuation Warning','Relief Distribution Announcement','Distribution Schedule','Beneficiary Notification','Relief Availability','General') NOT NULL DEFAULT 'General',
  `status` enum('Sent','Failed','Not Configured') NOT NULL DEFAULT 'Sent',
  `error_message` text DEFAULT NULL,
  `sent_by` int(11) DEFAULT NULL,
  `sent_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`sms_id`),
  KEY `sent_by` (`sent_by`),
  CONSTRAINT `sms_logs_ibfk_1` FOREIGN KEY (`sent_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `system_settings` (
  `setting_key` varchar(100) NOT NULL,
  `setting_value` text DEFAULT NULL,
  `updated_by` int(11) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`setting_key`),
  KEY `updated_by` (`updated_by`),
  CONSTRAINT `system_settings_ibfk_1` FOREIGN KEY (`updated_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
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
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
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
/*!40101 SET character_set_client = @saved_cs_client */;

-- ---------------------------------------------------------
-- DEFAULT CONFIGURATION / SEED DATA
-- ---------------------------------------------------------

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

-- ---------------------------------------------------------
-- OPTIONAL SAMPLE RELIEF ITEMS
-- Starter catalogue with opening stock, carried over from the original
-- fresh-install dump. backend/setup_demo_data.php expects Rice, Drinking Water
-- and Hygiene Kits to exist. For a real deployment that should start with
-- empty stock, delete this INSERT (or zero the quantities) before importing,
-- then record actual stock through Inventory -> Stock In.
-- ---------------------------------------------------------
INSERT INTO relief_items (item_name, category, quantity, unit, minimum_level, expiration_date) VALUES
('Rice', 'Food', 100, 'sack', 20, '2027-01-01'),
('Drinking Water', 'Water', 200, 'liter', 50, '2026-12-01'),
('Canned Goods', 'Food', 150, 'can', 30, '2027-06-01'),
('Hygiene Kits', 'Hygiene', 50, 'kit', 10, NULL),
('Blankets', 'Shelter', 40, 'pc', 10, NULL),
('First Aid Kits', 'Medical', 25, 'kit', 5, NULL);

SET FOREIGN_KEY_CHECKS = 1;

-- =========================================================
-- Barangay Binitayan - Post Disaster Monitoring & Relief
-- Allocation with Decision Support System (Simplified 30%)
-- =========================================================
-- Import this file through phpMyAdmin (or `mysql -u root -p < file.sql`)

CREATE DATABASE IF NOT EXISTS barangay_disaster_db
  CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;

USE barangay_disaster_db;

-- ---------------------------------------------------------
-- 1. USERS
-- ---------------------------------------------------------
CREATE TABLE users (
  user_id INT AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(150) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,          -- password_hash()
  role ENUM('admin','resident','relief_personnel') NOT NULL DEFAULT 'resident',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  contact_number VARCHAR(20) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------
-- 2. HOUSEHOLDS
-- ---------------------------------------------------------
CREATE TABLE households (
  household_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT DEFAULT NULL,               -- linked resident account (optional)
  head_of_family VARCHAR(150) NOT NULL,
  purok VARCHAR(50) NOT NULL,
  address VARCHAR(255) NOT NULL,
  number_of_members INT NOT NULL DEFAULT 1,
  vulnerable_members INT NOT NULL DEFAULT 0,   -- auto-computed sum of the categories below
  children_count INT NOT NULL DEFAULT 0,
  seniors_count INT NOT NULL DEFAULT 0,
  pwd_count INT NOT NULL DEFAULT 0,
  pregnant_count INT NOT NULL DEFAULT 0,
  medical_needs_count INT NOT NULL DEFAULT 0,
  other_vulnerable_count INT NOT NULL DEFAULT 0,
  contact_number VARCHAR(20) DEFAULT NULL,
  latitude DECIMAL(10,7) DEFAULT NULL,
  longitude DECIMAL(10,7) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL
);

-- ---------------------------------------------------------
-- 3. HOUSEHOLD MEMBERS (named individuals within a household)
-- ---------------------------------------------------------
CREATE TABLE household_members (
  member_id INT AUTO_INCREMENT PRIMARY KEY,
  household_id INT NOT NULL,
  full_name VARCHAR(150) NOT NULL,
  relationship VARCHAR(100) DEFAULT NULL,   -- e.g. Spouse, Son, Daughter, Head
  age INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (household_id) REFERENCES households(household_id) ON DELETE CASCADE
);

-- ---------------------------------------------------------
-- 4. DISASTER REPORTS
-- ---------------------------------------------------------
CREATE TABLE disaster_reports (
  report_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,                    -- resident who submitted it
  household_id INT DEFAULT NULL,
  disaster_type VARCHAR(50) NOT NULL,      -- validated against disaster_types table (Phase 14)
  location VARCHAR(255) NOT NULL,
  description TEXT,
  report_date DATE NOT NULL,
  report_time TIME DEFAULT NULL,
  severity ENUM('Low','Medium','High','Critical') NOT NULL,
  status ENUM('Pending','Verified','Rejected') NOT NULL DEFAULT 'Pending',
  verified_by INT DEFAULT NULL,
  verified_at TIMESTAMP NULL DEFAULT NULL,
  verification_remarks TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  FOREIGN KEY (household_id) REFERENCES households(household_id) ON DELETE SET NULL,
  FOREIGN KEY (verified_by) REFERENCES users(user_id) ON DELETE SET NULL
);

-- ---------------------------------------------------------
-- 4a. DISASTER REPORT PHOTOS (multiple per report)
-- ---------------------------------------------------------
CREATE TABLE report_photos (
  photo_id INT AUTO_INCREMENT PRIMARY KEY,
  report_id INT NOT NULL,
  file_path VARCHAR(255) NOT NULL,
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (report_id) REFERENCES disaster_reports(report_id) ON DELETE CASCADE
);

-- ---------------------------------------------------------
-- 4b. DAMAGE ASSESSMENTS (one per report, completed by admin)
-- ---------------------------------------------------------
CREATE TABLE damage_assessments (
  assessment_id INT AUTO_INCREMENT PRIMARY KEY,
  report_id INT NOT NULL UNIQUE,
  house_damage ENUM('None','Minor','Major','Totally Damaged') NOT NULL DEFAULT 'None',
  infrastructure_damage ENUM('None','Minor','Major','Totally Damaged') NOT NULL DEFAULT 'None',
  property_damage ENUM('None','Minor','Major','Totally Damaged') NOT NULL DEFAULT 'None',
  agricultural_damage ENUM('None','Minor','Major','Totally Damaged') NOT NULL DEFAULT 'None',
  estimated_severity ENUM('Low','Medium','High','Critical') NOT NULL DEFAULT 'Low',
  remarks TEXT,
  assessed_by INT DEFAULT NULL,
  assessed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (report_id) REFERENCES disaster_reports(report_id) ON DELETE CASCADE,
  FOREIGN KEY (assessed_by) REFERENCES users(user_id) ON DELETE SET NULL
);

-- ---------------------------------------------------------
-- 5. RELIEF ITEMS (inventory)
-- ---------------------------------------------------------
CREATE TABLE relief_items (
  item_id INT AUTO_INCREMENT PRIMARY KEY,
  item_name VARCHAR(150) NOT NULL,
  category VARCHAR(50) NOT NULL DEFAULT 'Other', -- validated against inventory_categories table (Phase 14)
  quantity INT NOT NULL DEFAULT 0,
  unit VARCHAR(50) NOT NULL DEFAULT 'pcs',
  minimum_level INT NOT NULL DEFAULT 10,   -- low-stock threshold
  expiration_date DATE DEFAULT NULL,
  date_added TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------
-- 5a. INVENTORY LOGS (stock-in, stock-out, adjustments, donations)
-- ---------------------------------------------------------
CREATE TABLE inventory_logs (
  log_id INT AUTO_INCREMENT PRIMARY KEY,
  item_id INT NOT NULL,
  log_type ENUM('Stock In','Stock Out','Adjustment','Donation') NOT NULL,
  quantity_change INT NOT NULL,
  resulting_quantity INT NOT NULL,
  reference VARCHAR(255) DEFAULT NULL,
  performed_by INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (item_id) REFERENCES relief_items(item_id) ON DELETE CASCADE,
  FOREIGN KEY (performed_by) REFERENCES users(user_id) ON DELETE SET NULL
);

-- ---------------------------------------------------------
-- 5b. DONATIONS
-- ---------------------------------------------------------
CREATE TABLE donations (
  donation_id INT AUTO_INCREMENT PRIMARY KEY,
  donor_name VARCHAR(150) NOT NULL,
  donor_contact VARCHAR(100) DEFAULT NULL,
  item_id INT NOT NULL,
  quantity INT NOT NULL,
  donation_date DATE NOT NULL,
  remarks TEXT,
  recorded_by INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (item_id) REFERENCES relief_items(item_id) ON DELETE CASCADE,
  FOREIGN KEY (recorded_by) REFERENCES users(user_id) ON DELETE SET NULL
);

-- ---------------------------------------------------------
-- 6. RELIEF PACKAGES (predefined item bundles, e.g. "Standard Family Pack")
-- ---------------------------------------------------------
CREATE TABLE relief_packages (
  package_id INT AUTO_INCREMENT PRIMARY KEY,
  package_name VARCHAR(150) NOT NULL,
  description TEXT,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE SET NULL
);

CREATE TABLE relief_package_items (
  package_item_id INT AUTO_INCREMENT PRIMARY KEY,
  package_id INT NOT NULL,
  item_id INT NOT NULL,
  quantity INT NOT NULL,
  FOREIGN KEY (package_id) REFERENCES relief_packages(package_id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES relief_items(item_id) ON DELETE CASCADE,
  UNIQUE KEY unique_package_item (package_id, item_id)
);

-- ---------------------------------------------------------
-- 6a. DISTRIBUTION SCHEDULES & BENEFICIARIES
-- ---------------------------------------------------------
CREATE TABLE distribution_schedules (
  schedule_id INT AUTO_INCREMENT PRIMARY KEY,
  package_id INT NOT NULL,
  distribution_date DATE NOT NULL,
  distribution_time TIME DEFAULT NULL,
  location VARCHAR(255) NOT NULL,
  assigned_personnel INT DEFAULT NULL,
  notes TEXT,
  created_by INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (package_id) REFERENCES relief_packages(package_id) ON DELETE RESTRICT,
  FOREIGN KEY (assigned_personnel) REFERENCES users(user_id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE SET NULL
);

CREATE TABLE distribution_beneficiaries (
  beneficiary_id INT AUTO_INCREMENT PRIMARY KEY,
  schedule_id INT NOT NULL,
  household_id INT NOT NULL,
  is_verified TINYINT(1) NOT NULL DEFAULT 0,
  verified_by INT DEFAULT NULL,
  verified_at TIMESTAMP NULL DEFAULT NULL,
  status ENUM('Pending','Prepared','Dispatched','Delivered','Cancelled') NOT NULL DEFAULT 'Pending',
  status_updated_by INT DEFAULT NULL,
  status_updated_at TIMESTAMP NULL DEFAULT NULL,
  remarks TEXT,
  FOREIGN KEY (schedule_id) REFERENCES distribution_schedules(schedule_id) ON DELETE CASCADE,
  FOREIGN KEY (household_id) REFERENCES households(household_id) ON DELETE CASCADE,
  FOREIGN KEY (verified_by) REFERENCES users(user_id) ON DELETE SET NULL,
  FOREIGN KEY (status_updated_by) REFERENCES users(user_id) ON DELETE SET NULL,
  UNIQUE KEY unique_schedule_household (schedule_id, household_id)
);

-- ---------------------------------------------------------
-- 6b. DELIVERY REPORTS (recipient confirmation + photo evidence)
-- ---------------------------------------------------------
CREATE TABLE delivery_reports (
  report_id INT AUTO_INCREMENT PRIMARY KEY,
  beneficiary_id INT NOT NULL UNIQUE,
  recipient_name VARCHAR(150) NOT NULL,
  remarks TEXT,
  submitted_by INT DEFAULT NULL,
  submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (beneficiary_id) REFERENCES distribution_beneficiaries(beneficiary_id) ON DELETE CASCADE,
  FOREIGN KEY (submitted_by) REFERENCES users(user_id) ON DELETE SET NULL
);

CREATE TABLE delivery_report_photos (
  photo_id INT AUTO_INCREMENT PRIMARY KEY,
  report_id INT NOT NULL,
  file_path VARCHAR(255) NOT NULL,
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (report_id) REFERENCES delivery_reports(report_id) ON DELETE CASCADE
);

-- ---------------------------------------------------------
-- 7. RELIEF ALLOCATIONS
-- ---------------------------------------------------------
CREATE TABLE relief_allocations (
  allocation_id INT AUTO_INCREMENT PRIMARY KEY,
  household_id INT NOT NULL,
  item_id INT NOT NULL,
  schedule_id INT DEFAULT NULL,   -- set when this allocation came from a Phase 8 distribution schedule
  quantity INT NOT NULL,
  status ENUM('Pending','Approved','Distributed') NOT NULL DEFAULT 'Pending',
  approved_by INT DEFAULT NULL,
  approved_at TIMESTAMP NULL DEFAULT NULL,
  recommendation_reason TEXT DEFAULT NULL,   -- set when this allocation came from the decision-support recommendation engine
  allocation_date DATE NOT NULL,
  distributed_by INT DEFAULT NULL,        -- relief personnel user_id
  distributed_at TIMESTAMP NULL DEFAULT NULL,
  FOREIGN KEY (household_id) REFERENCES households(household_id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES relief_items(item_id) ON DELETE CASCADE,
  FOREIGN KEY (schedule_id) REFERENCES distribution_schedules(schedule_id) ON DELETE SET NULL,
  FOREIGN KEY (approved_by) REFERENCES users(user_id) ON DELETE SET NULL,
  FOREIGN KEY (distributed_by) REFERENCES users(user_id) ON DELETE SET NULL
);

-- ---------------------------------------------------------
-- 8. AUDIT LOGS
-- ---------------------------------------------------------
CREATE TABLE audit_logs (
  log_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT DEFAULT NULL,
  action VARCHAR(255) NOT NULL,
  details TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL
);

-- ---------------------------------------------------------
-- 8a. LOGIN HISTORY
-- ---------------------------------------------------------
CREATE TABLE login_history (
  history_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT DEFAULT NULL,
  email_attempted VARCHAR(150) DEFAULT NULL,
  login_status ENUM('Success','Failed') NOT NULL,
  failure_reason VARCHAR(255) DEFAULT NULL,
  login_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  logout_at TIMESTAMP NULL DEFAULT NULL,
  ip_address VARCHAR(45) DEFAULT NULL,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL
);

-- ---------------------------------------------------------
-- 9. WEATHER LOGS (manually entered by default; `source` tracks
--    whether an entry was typed in by an admin or synced from a
--    real weather API once one is optionally connected — see README)
-- ---------------------------------------------------------
CREATE TABLE weather_logs (
  weather_id INT AUTO_INCREMENT PRIMARY KEY,
  log_date DATE NOT NULL,
  log_time TIME DEFAULT NULL,
  temperature DECIMAL(4,1) DEFAULT NULL,
  rainfall_mm DECIMAL(6,1) DEFAULT NULL,
  weather_condition ENUM('Sunny','Cloudy','Overcast','Rainy','Stormy','Foggy','Other') NOT NULL DEFAULT 'Sunny',
  wind_speed_kph DECIMAL(5,1) DEFAULT NULL,
  wind_direction VARCHAR(10) DEFAULT NULL,
  source ENUM('Manual','API') NOT NULL DEFAULT 'Manual',
  remarks TEXT,
  recorded_by INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (recorded_by) REFERENCES users(user_id) ON DELETE SET NULL
);

-- ---------------------------------------------------------
-- 10. HAZARD ALERTS
-- ---------------------------------------------------------
CREATE TABLE hazard_alerts (
  alert_id INT AUTO_INCREMENT PRIMARY KEY,
  hazard_type ENUM('Flood','Typhoon','Landslide','General Emergency') NOT NULL,
  status ENUM('Normal','Alert','Warning','Critical') NOT NULL DEFAULT 'Alert',
  title VARCHAR(150) NOT NULL,
  description TEXT,
  affected_purok VARCHAR(50) DEFAULT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  issued_by INT DEFAULT NULL,
  issued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  resolved_by INT DEFAULT NULL,
  resolved_at TIMESTAMP NULL DEFAULT NULL,
  FOREIGN KEY (issued_by) REFERENCES users(user_id) ON DELETE SET NULL,
  FOREIGN KEY (resolved_by) REFERENCES users(user_id) ON DELETE SET NULL
);

-- ---------------------------------------------------------
-- 11. SMS LOGS
-- ---------------------------------------------------------
CREATE TABLE sms_logs (
  sms_id INT AUTO_INCREMENT PRIMARY KEY,
  recipient_type ENUM('Resident','Relief Personnel','Household','Custom') NOT NULL,
  recipient_name VARCHAR(150) DEFAULT NULL,
  recipient_number VARCHAR(20) NOT NULL,
  message TEXT NOT NULL,
  category ENUM(
    'Emergency Warning','Disaster Alert','Evacuation Warning','Relief Distribution Announcement',
    'Distribution Schedule','Beneficiary Notification','Relief Availability','General'
  ) NOT NULL DEFAULT 'General',
  status ENUM('Sent','Failed','Not Configured') NOT NULL DEFAULT 'Sent',
  error_message TEXT DEFAULT NULL,
  sent_by INT DEFAULT NULL,
  sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (sent_by) REFERENCES users(user_id) ON DELETE SET NULL
);

-- ---------------------------------------------------------
-- 12. SYSTEM SETTINGS (Phase 14 — key-value barangay/contact info)
-- ---------------------------------------------------------
CREATE TABLE system_settings (
  setting_key VARCHAR(100) PRIMARY KEY,
  setting_value TEXT,
  updated_by INT DEFAULT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (updated_by) REFERENCES users(user_id) ON DELETE SET NULL
);

-- ---------------------------------------------------------
-- 13. INVENTORY CATEGORIES (Phase 14 — admin-managed, replaces ENUM)
-- ---------------------------------------------------------
CREATE TABLE inventory_categories (
  category_id INT AUTO_INCREMENT PRIMARY KEY,
  category_name VARCHAR(50) NOT NULL UNIQUE,
  is_active TINYINT(1) NOT NULL DEFAULT 1
);

-- ---------------------------------------------------------
-- 14. DISASTER TYPES (Phase 14 — admin-managed, replaces ENUM)
-- ---------------------------------------------------------
CREATE TABLE disaster_types (
  type_id INT AUTO_INCREMENT PRIMARY KEY,
  type_name VARCHAR(50) NOT NULL UNIQUE,
  is_active TINYINT(1) NOT NULL DEFAULT 1
);

-- ---------------------------------------------------------
-- SAMPLE / SEED DATA
-- ---------------------------------------------------------

-- System settings defaults
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

-- Inventory category defaults (mirrors the categories previously hardcoded as an ENUM)
INSERT INTO inventory_categories (category_name) VALUES
('Food'), ('Water'), ('Hygiene'), ('Medical'), ('Shelter'), ('Other');

-- Disaster type defaults (mirrors the types previously hardcoded as an ENUM)
INSERT INTO disaster_types (type_name) VALUES
('Flood'), ('Typhoon'), ('Landslide'), ('Earthquake'), ('Fire'), ('Other');

-- NOTE: No admin account is seeded here because password hashes must be generated
-- by PHP's password_hash() function to guarantee they verify correctly.
-- After importing this file, open the following URL ONCE in your browser to create
-- the first admin account (email: admin@binitayan.gov.ph / password: admin123):
--     http://localhost/barangay-disaster/backend/setup_admin.php
-- Delete backend/setup_admin.php afterwards for security.

-- Sample relief items
INSERT INTO relief_items (item_name, category, quantity, unit, minimum_level, expiration_date) VALUES
('Rice', 'Food', 100, 'sack', 20, '2027-01-01'),
('Drinking Water', 'Water', 200, 'liter', 50, '2026-12-01'),
('Canned Goods', 'Food', 150, 'can', 30, '2027-06-01'),
('Hygiene Kits', 'Hygiene', 50, 'kit', 10, NULL),
('Blankets', 'Shelter', 40, 'pc', 10, NULL),
('First Aid Kits', 'Medical', 25, 'kit', 5, NULL);

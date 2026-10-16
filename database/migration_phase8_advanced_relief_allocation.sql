-- =========================================================
-- PHASE 8 MIGRATION — Advanced Relief Allocation
-- Run this in phpMyAdmin (SQL tab) against barangay_disaster_db
-- if you already imported the database from a previous phase.
-- (Skip this file if importing barangay_disaster_db.sql fresh —
-- it already includes everything below.)
-- =========================================================

USE barangay_disaster_db;

-- A relief package is a predefined bundle of items+quantities (e.g. a
-- "Standard Family Pack") that can be distributed as a unit.
CREATE TABLE IF NOT EXISTS relief_packages (
  package_id INT AUTO_INCREMENT PRIMARY KEY,
  package_name VARCHAR(150) NOT NULL,
  description TEXT,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS relief_package_items (
  package_item_id INT AUTO_INCREMENT PRIMARY KEY,
  package_id INT NOT NULL,
  item_id INT NOT NULL,
  quantity INT NOT NULL,
  FOREIGN KEY (package_id) REFERENCES relief_packages(package_id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES relief_items(item_id) ON DELETE CASCADE,
  UNIQUE KEY unique_package_item (package_id, item_id)
);

-- A distribution schedule is a planned relief event: a package, a date/time/
-- location, an assigned relief personnel, and a set of beneficiary households.
CREATE TABLE IF NOT EXISTS distribution_schedules (
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

-- Each household selected as a beneficiary of a schedule, tracked individually
-- through the verification + delivery pipeline.
CREATE TABLE IF NOT EXISTS distribution_beneficiaries (
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

-- Link relief_allocations back to the schedule/beneficiary that produced them,
-- so Distribution History can show schedule context (date, location, personnel)
-- for allocations that came from this new scheduling workflow. Allocations
-- created via the older manual/recommendation flows simply have NULL here.
ALTER TABLE relief_allocations
  ADD COLUMN schedule_id INT DEFAULT NULL AFTER item_id,
  ADD CONSTRAINT fk_alloc_schedule FOREIGN KEY (schedule_id) REFERENCES distribution_schedules(schedule_id) ON DELETE SET NULL;

-- =========================================================
-- PHASE 2 MIGRATION — Complete Household Profiling
-- Run this in phpMyAdmin (SQL tab) against barangay_disaster_db
-- if you already imported the database from Phase 1.
-- (Skip this file if you're importing barangay_disaster_db.sql fresh —
-- it already includes everything below.)
-- =========================================================

USE barangay_disaster_db;

-- Detailed vulnerability breakdown per household.
-- `vulnerable_members` is kept and is now automatically recalculated by the
-- backend as the sum of the six categories below whenever a household is saved.
ALTER TABLE households
  ADD COLUMN children_count INT NOT NULL DEFAULT 0 AFTER vulnerable_members,
  ADD COLUMN seniors_count INT NOT NULL DEFAULT 0 AFTER children_count,
  ADD COLUMN pwd_count INT NOT NULL DEFAULT 0 AFTER seniors_count,
  ADD COLUMN pregnant_count INT NOT NULL DEFAULT 0 AFTER pwd_count,
  ADD COLUMN medical_needs_count INT NOT NULL DEFAULT 0 AFTER pregnant_count,
  ADD COLUMN other_vulnerable_count INT NOT NULL DEFAULT 0 AFTER medical_needs_count;

-- Named individual members of a household (for identification / headcount detail).
CREATE TABLE IF NOT EXISTS household_members (
  member_id INT AUTO_INCREMENT PRIMARY KEY,
  household_id INT NOT NULL,
  full_name VARCHAR(150) NOT NULL,
  relationship VARCHAR(100) DEFAULT NULL,   -- e.g. Spouse, Son, Daughter, Head
  age INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (household_id) REFERENCES households(household_id) ON DELETE CASCADE
);

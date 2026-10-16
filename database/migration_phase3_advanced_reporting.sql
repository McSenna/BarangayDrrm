-- =========================================================
-- PHASE 3 MIGRATION — Advanced Disaster Reporting
-- Run this in phpMyAdmin (SQL tab) against barangay_disaster_db
-- if you already imported the database from a previous phase.
-- (Skip this file if importing barangay_disaster_db.sql fresh —
-- it already includes everything below.)
-- =========================================================

USE barangay_disaster_db;

-- Report time (in addition to the existing report_date), plus verification tracking.
ALTER TABLE disaster_reports
  ADD COLUMN report_time TIME DEFAULT NULL AFTER report_date,
  ADD COLUMN verified_by INT DEFAULT NULL AFTER status,
  ADD COLUMN verified_at TIMESTAMP NULL DEFAULT NULL AFTER verified_by,
  ADD COLUMN verification_remarks TEXT DEFAULT NULL AFTER verified_at,
  ADD CONSTRAINT fk_reports_verified_by FOREIGN KEY (verified_by) REFERENCES users(user_id) ON DELETE SET NULL;

-- Multiple photos per disaster report.
CREATE TABLE IF NOT EXISTS report_photos (
  photo_id INT AUTO_INCREMENT PRIMARY KEY,
  report_id INT NOT NULL,
  file_path VARCHAR(255) NOT NULL,
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (report_id) REFERENCES disaster_reports(report_id) ON DELETE CASCADE
);

-- Admin-completed damage assessment, one per report.
CREATE TABLE IF NOT EXISTS damage_assessments (
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

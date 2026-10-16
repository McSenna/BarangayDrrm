-- =========================================================
-- PHASE 9 MIGRATION — Relief Personnel Features
-- Run this in phpMyAdmin (SQL tab) against barangay_disaster_db
-- if you already imported the database from a previous phase.
-- (Skip this file if importing barangay_disaster_db.sql fresh —
-- it already includes everything below.)
-- =========================================================

USE barangay_disaster_db;

-- One delivery report per beneficiary, created at the moment relief personnel
-- confirm a delivery (status -> Delivered): who actually received it, remarks,
-- and who submitted the report.
CREATE TABLE IF NOT EXISTS delivery_reports (
  report_id INT AUTO_INCREMENT PRIMARY KEY,
  beneficiary_id INT NOT NULL UNIQUE,
  recipient_name VARCHAR(150) NOT NULL,
  remarks TEXT,
  submitted_by INT DEFAULT NULL,
  submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (beneficiary_id) REFERENCES distribution_beneficiaries(beneficiary_id) ON DELETE CASCADE,
  FOREIGN KEY (submitted_by) REFERENCES users(user_id) ON DELETE SET NULL
);

-- Optional photo evidence attached to a delivery report.
CREATE TABLE IF NOT EXISTS delivery_report_photos (
  photo_id INT AUTO_INCREMENT PRIMARY KEY,
  report_id INT NOT NULL,
  file_path VARCHAR(255) NOT NULL,
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (report_id) REFERENCES delivery_reports(report_id) ON DELETE CASCADE
);

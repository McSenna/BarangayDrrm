-- =========================================================
-- PHASE 10 MIGRATION — SMS Notification System
-- Run this in phpMyAdmin (SQL tab) against barangay_disaster_db
-- if you already imported the database from a previous phase.
-- (Skip this file if importing barangay_disaster_db.sql fresh —
-- it already includes everything below.)
-- =========================================================

USE barangay_disaster_db;

CREATE TABLE IF NOT EXISTS sms_logs (
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

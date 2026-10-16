-- =========================================================
-- PHASE 13 MIGRATION — Audit and System Security
-- Run this in phpMyAdmin (SQL tab) against barangay_disaster_db
-- if you already imported the database from a previous phase.
-- (Skip this file if importing barangay_disaster_db.sql fresh —
-- it already includes everything below.)
-- =========================================================

USE barangay_disaster_db;

CREATE TABLE IF NOT EXISTS login_history (
  history_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT DEFAULT NULL,                    -- NULL if the email didn't match any account
  email_attempted VARCHAR(150) DEFAULT NULL,
  login_status ENUM('Success','Failed') NOT NULL,
  failure_reason VARCHAR(255) DEFAULT NULL,     -- e.g. "Invalid credentials", "Account deactivated"
  login_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  logout_at TIMESTAMP NULL DEFAULT NULL,
  ip_address VARCHAR(45) DEFAULT NULL,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL
);

-- The existing audit_logs table (present since the original schema) already
-- records data changes, allocation approvals, etc. via the log_action() helper
-- used throughout the backend — no changes needed to that table, just a new
-- admin page to actually view it (see Phase 13 in README).

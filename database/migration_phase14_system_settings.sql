-- =========================================================
-- Phase 14 migration — System Settings
-- Run this against an EXISTING barangay_disaster_db database
-- (skip this file if you are importing barangay_disaster_db.sql
-- fresh — it already contains these changes).
-- =========================================================

USE barangay_disaster_db;

-- ---------------------------------------------------------
-- Key-value system settings (barangay info / contact info)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS system_settings (
  setting_key VARCHAR(100) PRIMARY KEY,
  setting_value TEXT,
  updated_by INT DEFAULT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (updated_by) REFERENCES users(user_id) ON DELETE SET NULL
);

INSERT IGNORE INTO system_settings (setting_key, setting_value) VALUES
  ('barangay_name', 'Barangay Binitayan'),
  ('system_name', 'Post-Disaster Monitoring and Relief Allocation System'),
  ('barangay_address', 'Barangay Hall, Binitayan'),
  ('office_hours', 'Monday–Friday, 8:00 AM – 5:00 PM'),
  ('contact_email', 'admin@binitayan.gov.ph'),
  ('contact_phone', '09171234567'),
  ('emergency_hotline', '911 / Local DRRM Office'),
  ('default_minimum_level', '10'),
  ('default_unit', 'pcs');

-- ---------------------------------------------------------
-- Inventory categories (replaces hardcoded ENUM on relief_items.category)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory_categories (
  category_id INT AUTO_INCREMENT PRIMARY KEY,
  category_name VARCHAR(50) NOT NULL UNIQUE,
  is_active TINYINT(1) NOT NULL DEFAULT 1
);

INSERT IGNORE INTO inventory_categories (category_name) VALUES
  ('Food'), ('Water'), ('Hygiene'), ('Medical'), ('Shelter'), ('Other');

ALTER TABLE relief_items MODIFY COLUMN category VARCHAR(50) NOT NULL DEFAULT 'Other';

-- ---------------------------------------------------------
-- Disaster types (replaces hardcoded ENUM on disaster_reports.disaster_type)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS disaster_types (
  type_id INT AUTO_INCREMENT PRIMARY KEY,
  type_name VARCHAR(50) NOT NULL UNIQUE,
  is_active TINYINT(1) NOT NULL DEFAULT 1
);

INSERT IGNORE INTO disaster_types (type_name) VALUES
  ('Flood'), ('Typhoon'), ('Landslide'), ('Earthquake'), ('Fire'), ('Other');

ALTER TABLE disaster_reports MODIFY COLUMN disaster_type VARCHAR(50) NOT NULL DEFAULT 'Other';

-- NOTE: Severity levels (Low/Medium/High/Critical) and disaster report statuses
-- (Pending/Verified/Rejected) are intentionally NOT converted to editable tables.
-- They are read-only reference values shown in System Settings > Disaster Settings
-- because severity feeds directly into the Decision Support priority-scoring
-- formula (Phase 6) and status drives the verification workflow (Phase 3) —
-- changing their spelling elsewhere in the app would silently break both.

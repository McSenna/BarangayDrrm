-- =========================================================
-- PHASE 4 MIGRATION — Hazard Monitoring
-- Run this in phpMyAdmin (SQL tab) against barangay_disaster_db
-- if you already imported the database from a previous phase.
-- (Skip this file if importing barangay_disaster_db.sql fresh —
-- it already includes everything below.)
--
-- NOTE: This module works fully with manual/admin-entered data by
-- design — no external weather API is required. The `source` column
-- on weather_logs distinguishes manual entries from ones synced later
-- from a real weather API, if you choose to enable that (see README).
-- =========================================================

USE barangay_disaster_db;

CREATE TABLE IF NOT EXISTS weather_logs (
  weather_id INT AUTO_INCREMENT PRIMARY KEY,
  log_date DATE NOT NULL,
  log_time TIME DEFAULT NULL,
  temperature DECIMAL(4,1) DEFAULT NULL,     -- degrees Celsius
  rainfall_mm DECIMAL(6,1) DEFAULT NULL,     -- millimeters
  weather_condition ENUM('Sunny','Cloudy','Overcast','Rainy','Stormy','Foggy','Other') NOT NULL DEFAULT 'Sunny',
  wind_speed_kph DECIMAL(5,1) DEFAULT NULL,
  wind_direction VARCHAR(10) DEFAULT NULL,   -- e.g. N, NE, SW
  source ENUM('Manual','API') NOT NULL DEFAULT 'Manual',
  remarks TEXT,
  recorded_by INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (recorded_by) REFERENCES users(user_id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS hazard_alerts (
  alert_id INT AUTO_INCREMENT PRIMARY KEY,
  hazard_type ENUM('Flood','Typhoon','Landslide','General Emergency') NOT NULL,
  status ENUM('Normal','Alert','Warning','Critical') NOT NULL DEFAULT 'Alert',
  title VARCHAR(150) NOT NULL,
  description TEXT,
  affected_purok VARCHAR(50) DEFAULT NULL,   -- NULL/blank = barangay-wide
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  issued_by INT DEFAULT NULL,
  issued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  resolved_by INT DEFAULT NULL,
  resolved_at TIMESTAMP NULL DEFAULT NULL,
  FOREIGN KEY (issued_by) REFERENCES users(user_id) ON DELETE SET NULL,
  FOREIGN KEY (resolved_by) REFERENCES users(user_id) ON DELETE SET NULL
);

-- If you ran an earlier version of this migration without the `source` column, run:
-- ALTER TABLE weather_logs ADD COLUMN source ENUM('Manual','API') NOT NULL DEFAULT 'Manual' AFTER wind_direction;

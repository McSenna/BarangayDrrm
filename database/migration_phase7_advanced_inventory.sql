-- =========================================================
-- PHASE 7 MIGRATION — Advanced Inventory Management
-- Run this in phpMyAdmin (SQL tab) against barangay_disaster_db
-- if you already imported the database from a previous phase.
-- (Skip this file if importing barangay_disaster_db.sql fresh —
-- it already includes everything below.)
-- =========================================================

USE barangay_disaster_db;

-- Normalize any existing free-text categories to the fixed set before
-- converting the column to an ENUM, so the ALTER doesn't fail or truncate data.
UPDATE relief_items
SET category = 'Other'
WHERE category NOT IN ('Food', 'Water', 'Hygiene', 'Medical', 'Shelter');

ALTER TABLE relief_items
  MODIFY COLUMN category ENUM('Food','Water','Hygiene','Medical','Shelter','Other') NOT NULL DEFAULT 'Other';

-- Unified transaction log for every quantity-changing inventory event —
-- covers stock-in history, stock-out history, adjustments, and donations
-- (donations also get their own dedicated donations table below, for donor details).
CREATE TABLE IF NOT EXISTS inventory_logs (
  log_id INT AUTO_INCREMENT PRIMARY KEY,
  item_id INT NOT NULL,
  log_type ENUM('Stock In','Stock Out','Adjustment','Donation') NOT NULL,
  quantity_change INT NOT NULL,        -- positive or negative delta
  resulting_quantity INT NOT NULL,     -- item's quantity immediately after this change
  reference VARCHAR(255) DEFAULT NULL, -- e.g. "Donor: Juan Dela Cruz", or an adjustment reason
  performed_by INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (item_id) REFERENCES relief_items(item_id) ON DELETE CASCADE,
  FOREIGN KEY (performed_by) REFERENCES users(user_id) ON DELETE SET NULL
);

-- Donation records with donor details, separate from the generic log so donor
-- info (name/contact) has a proper home rather than being squeezed into a text field.
CREATE TABLE IF NOT EXISTS donations (
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

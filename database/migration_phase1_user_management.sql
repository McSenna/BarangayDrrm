-- =========================================================
-- PHASE 1 MIGRATION — User Management improvements
-- Run this in phpMyAdmin (SQL tab) against barangay_disaster_db
-- if you already imported the original barangay_disaster_db.sql.
-- (Skip this file if you're importing the schema fresh — the
-- updated barangay_disaster_db.sql already includes this column.)
-- =========================================================

USE barangay_disaster_db;

ALTER TABLE users
  ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1 AFTER role;

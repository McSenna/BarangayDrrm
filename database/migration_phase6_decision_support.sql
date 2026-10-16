-- =========================================================
-- PHASE 6 MIGRATION — Decision Support System
-- Run this in phpMyAdmin (SQL tab) against barangay_disaster_db
-- if you already imported the database from a previous phase.
-- (Skip this file if importing barangay_disaster_db.sql fresh —
-- it already includes everything below.)
-- =========================================================

USE barangay_disaster_db;

ALTER TABLE relief_allocations
  ADD COLUMN approved_by INT DEFAULT NULL AFTER status,
  ADD COLUMN approved_at TIMESTAMP NULL DEFAULT NULL AFTER approved_by,
  ADD COLUMN recommendation_reason TEXT DEFAULT NULL AFTER approved_at,
  ADD CONSTRAINT fk_alloc_approved_by FOREIGN KEY (approved_by) REFERENCES users(user_id) ON DELETE SET NULL;

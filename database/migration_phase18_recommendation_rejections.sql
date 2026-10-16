-- =========================================================
-- PHASE 18 MIGRATION — Persistent Relief Recommendation Rejections
--
-- WHY: Relief recommendations are computed on the fly by
-- backend/dashboard/relief_recommendations.php; they are not stored rows.
-- The only relief table, relief_allocations, has statuses
-- Pending / Approved / Distributed and represents real allocations, so a
-- rejected suggestion cannot be stored there without affecting stock,
-- priority and history logic. This small table records the Administrator's
-- decision to reject a recommendation (household + relief item) so it stays
-- rejected after the page is reloaded, until the Administrator restores it.
--
-- HOW TO RUN (existing database only):
--   phpMyAdmin -> select your database -> SQL tab -> paste this file -> Go.
--   Safe to run more than once (CREATE TABLE IF NOT EXISTS).
--   Skip this file if you import database/barangay_disaster_db_complete.sql
--   fresh — that file already includes this table.
-- =========================================================

CREATE TABLE IF NOT EXISTS `relief_recommendation_rejections` (
  `rejection_id` int(11) NOT NULL AUTO_INCREMENT,
  `household_id` int(11) NOT NULL,
  `item_id` int(11) NOT NULL,
  `reason` varchar(255) DEFAULT NULL,
  `rejected_by` int(11) DEFAULT NULL,
  `rejected_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`rejection_id`),
  UNIQUE KEY `uq_recommendation_rejection` (`household_id`,`item_id`),
  KEY `fk_rec_rejection_item` (`item_id`),
  KEY `fk_rec_rejection_user` (`rejected_by`),
  CONSTRAINT `fk_rec_rejection_household` FOREIGN KEY (`household_id`) REFERENCES `households` (`household_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_rec_rejection_item` FOREIGN KEY (`item_id`) REFERENCES `relief_items` (`item_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_rec_rejection_user` FOREIGN KEY (`rejected_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

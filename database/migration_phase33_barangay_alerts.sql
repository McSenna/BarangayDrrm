-- Phase 33: Active Barangay Alerts (docs/superpowers/plans/2026-10-17-active-barangay-alerts.md).
-- Extends hazard_alerts in place, so the header status chip, DRRM phase, dashboard and public status keep reading
-- one alert table. Alerts move Draft -> Active -> Inactive only through backend/lib/barangay_alerts.php.
--   alert_status  the lifecycle; is_active stays as its mirror (CHECK below) for existing readers.
--   status        the severity: Advisory / Warning / Critical for new alerts (Normal / Alert kept for old rows).
--   issued_*      activation time and administrator; resolved_* deactivation time and administrator.
-- Repeatable: every statement is guarded, so running it twice changes nothing. No row is deleted or rewritten
-- except to fill the new columns.

ALTER TABLE hazard_alerts
  MODIFY hazard_type ENUM('Flood','Typhoon','Landslide','Fire','Earthquake','General Emergency','Other') NOT NULL,
  MODIFY status ENUM('Normal','Alert','Advisory','Warning','Critical') NOT NULL DEFAULT 'Advisory',
  MODIFY affected_purok VARCHAR(120) DEFAULT NULL;

-- Defaults are computed from the row, so older scripts that insert only is_active / affected_purok stay consistent.
ALTER TABLE hazard_alerts
  ADD COLUMN IF NOT EXISTS alert_status ENUM('Draft','Active','Inactive') NOT NULL DEFAULT (IF(is_active = 1, 'Active', 'Inactive')) AFTER is_active,
  ADD COLUMN IF NOT EXISTS scope ENUM('barangay','puroks') NOT NULL DEFAULT (IF(affected_purok IS NULL OR TRIM(affected_purok) = '', 'barangay', 'puroks')) AFTER affected_purok,
  ADD COLUMN IF NOT EXISTS instructions TEXT NULL AFTER description,
  ADD COLUMN IF NOT EXISTS resolution_note VARCHAR(500) NULL AFTER resolved_at,
  ADD COLUMN IF NOT EXISTS created_by INT NULL,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS updated_by INT NULL,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1;

UPDATE hazard_alerts SET created_at = COALESCE(issued_at, CURRENT_TIMESTAMP), created_by = issued_by WHERE created_at IS NULL;
UPDATE hazard_alerts SET updated_at = COALESCE(resolved_at, issued_at, created_at), updated_by = COALESCE(resolved_by, issued_by) WHERE updated_at IS NULL;
ALTER TABLE hazard_alerts
  MODIFY created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  MODIFY updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE hazard_alerts ADD CONSTRAINT IF NOT EXISTS chk_hazard_alerts_state CHECK ((alert_status = 'Active') = (is_active = 1));
ALTER TABLE hazard_alerts ADD INDEX IF NOT EXISTS idx_hazard_alerts_alert_status (alert_status);
ALTER TABLE hazard_alerts ADD CONSTRAINT fk_hazard_alerts_created_by FOREIGN KEY IF NOT EXISTS (created_by) REFERENCES users (user_id) ON DELETE SET NULL;
ALTER TABLE hazard_alerts ADD CONSTRAINT fk_hazard_alerts_updated_by FOREIGN KEY IF NOT EXISTS (updated_by) REFERENCES users (user_id) ON DELETE SET NULL;

-- Selected Puroks (scope = 'puroks'). Older rows with one value in affected_purok are read from that column
-- (normalised in PHP) until an administrator edits them.
CREATE TABLE IF NOT EXISTS hazard_alert_puroks (
  alert_id INT NOT NULL,
  purok VARCHAR(20) NOT NULL,
  PRIMARY KEY (alert_id, purok),
  KEY idx_hazard_alert_puroks_purok (purok),
  CONSTRAINT fk_hazard_alert_puroks_alert FOREIGN KEY (alert_id) REFERENCES hazard_alerts (alert_id) ON DELETE CASCADE,
  CONSTRAINT chk_hazard_alert_puroks_purok CHECK (purok IN ('Purok 1','Purok 2','Purok 3','Purok 4','Purok 5A','Purok 5B','Purok 6','Purok 7'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Audit trail. An alert is activated at most once and turned off at most once (Inactive is final), and the
-- unique key holds that even under simultaneous requests, so a repeated turn-off never adds a second entry.
-- History goes with its alert only when the alert row itself is deleted: the app deletes nothing but never-active
-- drafts, while maintenance scripts (DEFENSE_TEST_DATA_CLEANUP.sql) delete test alerts directly.
CREATE TABLE IF NOT EXISTS hazard_alert_history (
  history_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  alert_id INT NOT NULL,
  action ENUM('created','updated','activated','deactivated') NOT NULL,
  from_status ENUM('Draft','Active','Inactive') NULL,
  to_status ENUM('Draft','Active','Inactive') NULL,
  acted_by INT NULL,
  acted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  note VARCHAR(500) NULL,
  changes TEXT NULL,
  once_key VARCHAR(40) AS (IF(action IN ('activated','deactivated'), CONCAT(alert_id, ':', action), NULL)) PERSISTENT,
  UNIQUE KEY uq_hazard_alert_history_once (once_key),
  KEY idx_hazard_alert_history_alert (alert_id, acted_at),
  CONSTRAINT fk_hazard_alert_history_alert FOREIGN KEY (alert_id) REFERENCES hazard_alerts (alert_id) ON DELETE CASCADE,
  CONSTRAINT fk_hazard_alert_history_user FOREIGN KEY (acted_by) REFERENCES users (user_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Databases that ran the first version of this migration had a restricting key here; re-create it cascading.
ALTER TABLE hazard_alert_history DROP FOREIGN KEY IF EXISTS fk_hazard_alert_history_alert;
ALTER TABLE hazard_alert_history ADD CONSTRAINT fk_hazard_alert_history_alert FOREIGN KEY (alert_id) REFERENCES hazard_alerts (alert_id) ON DELETE CASCADE;

-- History for alerts issued before this phase (activation and resolution times as recorded). NOT EXISTS keeps a
-- re-run from even attempting a duplicate (an ignored INSERT would still use up AUTO_INCREMENT values).
INSERT IGNORE INTO hazard_alert_history (alert_id, action, from_status, to_status, acted_by, acted_at, note)
  SELECT alert_id, 'activated', 'Draft', 'Active', issued_by, issued_at, 'Recorded before alert history was kept.'
  FROM hazard_alerts ha WHERE alert_status IN ('Active', 'Inactive') AND issued_at IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM hazard_alert_history h WHERE h.alert_id = ha.alert_id AND h.action = 'activated');
INSERT IGNORE INTO hazard_alert_history (alert_id, action, from_status, to_status, acted_by, acted_at, note)
  SELECT alert_id, 'deactivated', 'Active', 'Inactive', resolved_by, resolved_at, resolution_note
  FROM hazard_alerts ha WHERE alert_status = 'Inactive' AND resolved_at IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM hazard_alert_history h WHERE h.alert_id = ha.alert_id AND h.action = 'deactivated');

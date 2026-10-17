-- Phase 32: relief allocation workflow (docs/superpowers/specs/2026-10-17-relief-allocation-workflow-design.md).
-- Household-level allocations moved only by backend/lib/allocation_workflow.php, field assessments per
-- allocation round, ledger columns for distribution stock-outs, no negative stock.
-- Repeatable: every statement is guarded, so running it twice changes nothing.
-- Old per-item relief_allocations rows stay as history; only Pending/Approved ones are cancelled.

CREATE TABLE IF NOT EXISTS household_allocations (
 allocation_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
 household_id INT NOT NULL,
 round_no INT NOT NULL DEFAULT 1,
 status ENUM('PENDING_ASSESSMENT','ASSESSMENT_IN_PROGRESS','READY_FOR_DISTRIBUTION','COMPLETED','CANCELLED') NOT NULL DEFAULT 'PENDING_ASSESSMENT',
 package_id INT NULL,
 ready_at DATETIME NULL,
 ready_score INT NULL,
 ready_priority VARCHAR(30) NULL,
 ready_snapshot LONGTEXT NULL,
 ready_rule_version VARCHAR(80) NULL,
 completed_by INT NULL,
 completed_at DATETIME NULL,
 completed_score INT NULL,
 completed_priority VARCHAR(30) NULL,
 completed_snapshot LONGTEXT NULL,
 completed_rule_version VARCHAR(80) NULL,
 recipient_name VARCHAR(150) NULL,
 proof_photo VARCHAR(255) NULL,
 completion_remarks VARCHAR(300) NULL,
 completion_key VARCHAR(64) NULL,
 cancelled_by INT NULL,
 cancelled_at DATETIME NULL,
 cancel_reason VARCHAR(500) NULL,
 created_by INT NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 version INT NOT NULL DEFAULT 1,
 -- At most one open allocation per household: closed rounds drop out of the unique key.
 active_household_id INT AS (IF(status IN ('COMPLETED','CANCELLED'), NULL, household_id)) PERSISTENT,
 UNIQUE KEY uq_household_allocations_active (active_household_id),
 UNIQUE KEY uq_household_allocations_completion_key (completion_key),
 KEY idx_household_allocations_status (status),
 KEY idx_household_allocations_household (household_id),
 KEY idx_household_allocations_status_score (status, ready_score),
 FOREIGN KEY (household_id) REFERENCES households(household_id),
 FOREIGN KEY (package_id) REFERENCES relief_packages(package_id) ON DELETE SET NULL,
 FOREIGN KEY (completed_by) REFERENCES users(user_id),
 FOREIGN KEY (cancelled_by) REFERENCES users(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS household_allocation_items (
 allocation_item_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
 allocation_id INT NOT NULL,
 item_id INT NULL,
 item_name VARCHAR(150) NOT NULL,
 unit VARCHAR(50) NOT NULL,
 planned_qty INT NOT NULL,
 released_qty INT NULL,
 UNIQUE KEY uq_household_allocation_items (allocation_id, item_id),
 FOREIGN KEY (allocation_id) REFERENCES household_allocations(allocation_id),
 FOREIGN KEY (item_id) REFERENCES relief_items(item_id) ON DELETE SET NULL,
 CONSTRAINT chk_household_allocation_items_qty CHECK (planned_qty >= 0 AND (released_qty IS NULL OR released_qty >= 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS household_allocation_history (
 history_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
 allocation_id INT NOT NULL,
 action VARCHAR(40) NOT NULL,
 from_status VARCHAR(30) NULL,
 to_status VARCHAR(30) NULL,
 reason VARCHAR(500) NULL,
 details LONGTEXT NULL,
 user_id INT NULL,
 ip_address VARCHAR(45) NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 KEY idx_household_allocation_history_allocation (allocation_id),
 FOREIGN KEY (allocation_id) REFERENCES household_allocations(allocation_id),
 FOREIGN KEY (user_id) REFERENCES users(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Field assessments become one per allocation round (a new round needs a new visit).
ALTER TABLE household_field_assessments
  ADD COLUMN IF NOT EXISTS allocation_id INT NULL AFTER household_id,
  ADD COLUMN IF NOT EXISTS damage_classification ENUM('Destroyed','Severely Damaged','Partially Damaged','Minor Damage','No Damage') NULL AFTER house_damage,
  ADD COLUMN IF NOT EXISTS draft_saved_at DATETIME NULL,
  ADD COLUMN IF NOT EXISTS locked_at DATETIME NULL,
  ADD COLUMN IF NOT EXISTS reopened_count INT NOT NULL DEFAULT 0,
  ADD INDEX IF NOT EXISTS idx_household_field_assessments_household (household_id),
  ADD UNIQUE INDEX IF NOT EXISTS uq_household_field_assessments_allocation (allocation_id);
-- The phase 29 one-per-household key; the plain index above keeps the household foreign key covered.
ALTER TABLE household_field_assessments DROP INDEX IF EXISTS household_id;

ALTER TABLE inventory_logs
  ADD COLUMN IF NOT EXISTS previous_quantity INT NULL AFTER quantity_change,
  ADD COLUMN IF NOT EXISTS allocation_ref INT NULL AFTER reference,
  ADD INDEX IF NOT EXISTS idx_inventory_logs_allocation_ref (allocation_ref);

ALTER TABLE relief_items DROP CONSTRAINT IF EXISTS chk_relief_items_quantity;
ALTER TABLE relief_items ADD CONSTRAINT chk_relief_items_quantity CHECK (quantity >= 0);

INSERT IGNORE INTO system_settings (setting_key, setting_value) VALUES ('standard_relief_package_id', '');

-- Round 1 for every household that has never had a workflow allocation. Later rounds are started by an Administrator.
INSERT INTO household_allocations (household_id, round_no, status)
SELECT h.household_id, 1, 'PENDING_ASSESSMENT' FROM households h
WHERE NOT EXISTS (SELECT 1 FROM household_allocations a WHERE a.household_id = h.household_id);

INSERT INTO household_allocation_history (allocation_id, action, from_status, to_status, reason)
SELECT a.allocation_id, 'seed', NULL, 'PENDING_ASSESSMENT', 'Created by migration phase 32'
FROM household_allocations a
WHERE a.round_no = 1 AND NOT EXISTS (SELECT 1 FROM household_allocation_history h WHERE h.allocation_id = a.allocation_id AND h.action = 'seed');

UPDATE household_field_assessments f
JOIN household_allocations a ON a.household_id = f.household_id AND a.round_no = 1
SET f.allocation_id = a.allocation_id
WHERE f.allocation_id IS NULL;

-- Approval never deducted stock, so no stock changes.
INSERT INTO audit_logs (user_id, action, details)
SELECT NULL, 'Legacy allocations cancelled',
       CONCAT('Migration phase 32 cancelled relief_allocations ', GROUP_CONCAT(allocation_id ORDER BY allocation_id), ': Replaced by the new allocation workflow')
FROM relief_allocations WHERE status IN ('Pending', 'Approved')
HAVING COUNT(*) > 0;

-- Databases created before phase 25 have no cancel columns: then only the status changes.
SET @phase32_has_cancel_reason := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'relief_allocations' AND COLUMN_NAME = 'cancel_reason');
SET @phase32_cancel_sql := IF(@phase32_has_cancel_reason > 0,
  'UPDATE relief_allocations SET status = ''Cancelled'', cancelled_at = NOW(), cancel_reason = ''Replaced by the new allocation workflow'' WHERE status IN (''Pending'', ''Approved'')',
  'UPDATE relief_allocations SET status = ''Cancelled'' WHERE status IN (''Pending'', ''Approved'')');
PREPARE phase32_cancel FROM @phase32_cancel_sql;
EXECUTE phase32_cancel;
DEALLOCATE PREPARE phase32_cancel;

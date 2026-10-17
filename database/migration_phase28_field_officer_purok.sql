-- Existing field officers remain unassigned until an administrator selects a Purok.
-- Never infer an assignment from an officer's name, address or previous reports.
ALTER TABLE users ADD COLUMN assigned_purok VARCHAR(50) NULL DEFAULT NULL;

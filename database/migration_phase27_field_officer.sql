-- Append the Field Officer role without changing existing role values.
-- Run against the selected application database before using field accounts.
ALTER TABLE users MODIFY COLUMN role
  ENUM('admin','resident','relief_personnel','field_officer') NOT NULL DEFAULT 'resident';

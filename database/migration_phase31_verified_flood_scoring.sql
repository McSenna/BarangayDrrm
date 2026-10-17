-- No existing source records or historical allocation snapshots are rewritten.
ALTER TABLE households
  ADD COLUMN IF NOT EXISTS flood_verified_at DATETIME NULL,
  ADD COLUMN IF NOT EXISTS flood_verified_by INT NULL,
  ADD COLUMN IF NOT EXISTS flood_verification_fingerprint VARCHAR(64) NULL;

-- Run against the selected application database before deploying approval code.
-- Additive and repeatable. Existing users have no request row and remain approved.
-- Admin-provisioned accounts also require no registration request.
CREATE TABLE IF NOT EXISTS user_registration_requests (
  user_id INT NOT NULL PRIMARY KEY,
  status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  requested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TIMESTAMP NULL DEFAULT NULL,
  reviewed_by INT DEFAULT NULL,
  INDEX idx_registration_status (status, requested_at),
  CONSTRAINT fk_registration_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  CONSTRAINT fk_registration_reviewer FOREIGN KEY (reviewed_by) REFERENCES users(user_id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS household_field_assessments (
 assessment_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
 household_id INT NOT NULL UNIQUE,
 assigned_field_officer_id INT NULL,
 status ENUM('pending_assignment','assigned','assessed') NOT NULL DEFAULT 'pending_assignment',
 field_visit_date DATE NULL,
 house_damage ENUM('None','Minor','Major','Totally Damaged') NULL,
 infrastructure_damage ENUM('None','Minor','Major','Totally Damaged') NULL,
 property_damage ENUM('None','Minor','Major','Totally Damaged') NULL,
 agricultural_damage ENUM('None','Minor','Major','Totally Damaged') NULL,
 estimated_severity ENUM('Low','Medium','High','Critical') NULL,
 findings TEXT NULL, remarks TEXT NULL, submitted_at DATETIME NULL,
 created_by INT NOT NULL, updated_by INT NOT NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 version INT NOT NULL DEFAULT 1,
 FOREIGN KEY (household_id) REFERENCES households(household_id),
 FOREIGN KEY (assigned_field_officer_id) REFERENCES users(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS household_assessment_revisions (
 revision_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
 assessment_id INT NOT NULL, action VARCHAR(32) NOT NULL,
 before_json LONGTEXT NULL, after_json LONGTEXT NOT NULL,
 changed_by INT NOT NULL, changed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY (assessment_id) REFERENCES household_field_assessments(assessment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS household_assessment_photos (
 photo_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
 assessment_id INT NOT NULL, photo_data MEDIUMBLOB NOT NULL,
 mime_type VARCHAR(40) NOT NULL, original_name VARCHAR(255) NOT NULL,
 uploaded_by INT NOT NULL, uploaded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY (assessment_id) REFERENCES household_field_assessments(assessment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


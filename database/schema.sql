-- Apply explicitly using backend/console.php migrate. MySQL 8.0+ required.
CREATE TABLE IF NOT EXISTS settings (
  setting_key VARCHAR(64) NOT NULL PRIMARY KEY,
  setting_value TEXT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS documents (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  size BIGINT UNSIGNED NOT NULL,
  storage_name VARCHAR(80) NOT NULL,
  file_id VARCHAR(128) NULL,
  vector_store_id VARCHAR(128) NULL,
  status ENUM('processing','ready','failed','deleting') NOT NULL DEFAULT 'processing',
  error VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  checked_at TIMESTAMP NULL,
  INDEX documents_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS messages (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  conversation_id CHAR(64) NOT NULL,
  role ENUM('user','assistant') NOT NULL,
  kind VARCHAR(24) NOT NULL DEFAULT 'chat',
  content MEDIUMTEXT NOT NULL,
  citations JSON NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX messages_conversation (conversation_id,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS rate_limits (
  bucket CHAR(64) NOT NULL PRIMARY KEY,
  hits INT UNSIGNED NOT NULL,
  expires_at BIGINT UNSIGNED NOT NULL,
  INDEX rate_limit_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS presentations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  size BIGINT UNSIGNED NOT NULL,
  storage_key CHAR(40) NOT NULL,
  source_type ENUM('pdf','pptx') NOT NULL,
  status ENUM('processing','ready','failed') NOT NULL DEFAULT 'processing',
  page_count INT UNSIGNED NOT NULL DEFAULT 0,
  error VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX presentations_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS presentation_slides (
  presentation_id BIGINT UNSIGNED NOT NULL,
  page_number INT UNSIGNED NOT NULL,
  title VARCHAR(255) NOT NULL,
  source_text MEDIUMTEXT NOT NULL,
  text_method ENUM('extracted','vision') NOT NULL,
  image_name VARCHAR(80) NOT NULL,
  PRIMARY KEY (presentation_id,page_number),
  CONSTRAINT presentation_slides_deck FOREIGN KEY (presentation_id) REFERENCES presentations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS presentation_narrations (
  presentation_id BIGINT UNSIGNED NOT NULL,
  page_number INT UNSIGNED NOT NULL,
  language CHAR(2) NOT NULL,
  scope_hash CHAR(64) NOT NULL,
  content TEXT NOT NULL,
  citations JSON NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (presentation_id,page_number,language,scope_hash),
  CONSTRAINT presentation_narrations_slide FOREIGN KEY (presentation_id,page_number) REFERENCES presentation_slides(presentation_id,page_number) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS presentation_progress (
  conversation_id CHAR(64) NOT NULL PRIMARY KEY,
  presentation_id BIGINT UNSIGNED NOT NULL,
  page_number INT UNSIGNED NOT NULL,
  language CHAR(2) NOT NULL,
  state ENUM('paused','presenting','questions','completed') NOT NULL DEFAULT 'paused',
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT presentation_progress_deck FOREIGN KEY (presentation_id) REFERENCES presentations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

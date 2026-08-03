-- MySQL 8.0+
CREATE DATABASE IF NOT EXISTS deepfabric CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE deepfabric;

CREATE TABLE users (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()), name VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE, password VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE workspaces (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()), user_id CHAR(36) NOT NULL,
  name VARCHAR(100) NOT NULL, description TEXT, tags JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE subjects (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()), workspace_id CHAR(36) NOT NULL,
  name VARCHAR(100) NOT NULL, description TEXT, tags JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);
CREATE TABLE modules (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()), subject_id CHAR(36) NOT NULL,
  name VARCHAR(100) NOT NULL, description TEXT, tags JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
);
CREATE TABLE sources (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()), module_id CHAR(36) NOT NULL,
  title VARCHAR(255) NOT NULL, source_type ENUM('paste','pdf','image') DEFAULT 'paste',
  current_version INT DEFAULT 1, status ENUM('draft','processed','needs_review') DEFAULT 'draft',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE CASCADE
);
CREATE TABLE source_versions (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()), source_id CHAR(36) NOT NULL,
  version INT NOT NULL, raw_text LONGTEXT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_source_version (source_id, version),
  FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE CASCADE
);
CREATE TABLE ai_runs (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()), user_id CHAR(36) NOT NULL,
  run_type ENUM('concept_extraction','question_generation','grading') NOT NULL,
  model VARCHAR(100) NOT NULL, prompt_version VARCHAR(50) NOT NULL,
  input_data JSON, output_data JSON, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE concepts (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()), module_id CHAR(36) NOT NULL,
  source_version_id CHAR(36) NOT NULL, source_excerpt TEXT, ai_run_id CHAR(36),
  merged_into_concept_id CHAR(36), title VARCHAR(255) NOT NULL, definition TEXT,
  facts JSON, tags JSON, status ENUM('suggested','accepted','edited','rejected','merged') DEFAULT 'suggested',
  is_outdated BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE CASCADE,
  FOREIGN KEY (source_version_id) REFERENCES source_versions(id) ON DELETE CASCADE,
  FOREIGN KEY (ai_run_id) REFERENCES ai_runs(id) ON DELETE SET NULL,
  FOREIGN KEY (merged_into_concept_id) REFERENCES concepts(id) ON DELETE SET NULL
);
CREATE TABLE questions (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()), module_id CHAR(36) NOT NULL, concept_id CHAR(36) NOT NULL,
  ai_run_id CHAR(36), question_type ENUM('mcq','true_false','short_answer') NOT NULL,
  question_text TEXT NOT NULL, options JSON, correct_answer TEXT NOT NULL, content_hash CHAR(64),
  difficulty TINYINT NOT NULL DEFAULT 3, status ENUM('generated','approved','edited','retired') NOT NULL DEFAULT 'generated',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_questions_module_hash (module_id, content_hash),
  CHECK (difficulty BETWEEN 1 AND 5),
  FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE CASCADE,
  FOREIGN KEY (concept_id) REFERENCES concepts(id) ON DELETE CASCADE,
  FOREIGN KEY (ai_run_id) REFERENCES ai_runs(id) ON DELETE SET NULL
);
CREATE TABLE question_versions (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()), question_id CHAR(36) NOT NULL, version INT NOT NULL,
  question_type ENUM('mcq','true_false','short_answer') NOT NULL, question_text TEXT NOT NULL,
  options JSON, correct_answer TEXT NOT NULL, difficulty TINYINT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_question_version (question_id, version), CHECK (difficulty BETWEEN 1 AND 5),
  FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
);
CREATE TABLE study_sessions (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()), user_id CHAR(36) NOT NULL, module_id CHAR(36) NOT NULL,
  score INT NOT NULL DEFAULT 0, question_count INT NOT NULL DEFAULT 10, question_types JSON,
  focus_mode BOOLEAN NOT NULL DEFAULT FALSE, started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, ended_at TIMESTAMP NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE CASCADE
);
CREATE TABLE study_session_questions (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()), study_session_id CHAR(36) NOT NULL,
  question_id CHAR(36) NOT NULL, question_version_id CHAR(36) NOT NULL, display_order INT NOT NULL,
  UNIQUE KEY uq_session_question (study_session_id, question_id),
  UNIQUE KEY uq_session_order (study_session_id, display_order),
  FOREIGN KEY (study_session_id) REFERENCES study_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE RESTRICT,
  FOREIGN KEY (question_version_id) REFERENCES question_versions(id) ON DELETE RESTRICT
);
CREATE TABLE attempts (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()), study_session_id CHAR(36) NOT NULL, question_id CHAR(36) NOT NULL,
  question_version_id CHAR(36), grading_ai_run_id CHAR(36), user_answer TEXT, time_taken_seconds INT,
  result ENUM('correct','incorrect','partial'), confidence DECIMAL(5,2), grading_reason TEXT,
  overridden BOOLEAN NOT NULL DEFAULT FALSE, override_reason TEXT, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 100),
  FOREIGN KEY (study_session_id) REFERENCES study_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE,
  FOREIGN KEY (question_version_id) REFERENCES question_versions(id) ON DELETE SET NULL,
  FOREIGN KEY (grading_ai_run_id) REFERENCES ai_runs(id) ON DELETE SET NULL
);
CREATE TABLE mastery (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()), user_id CHAR(36) NOT NULL, concept_id CHAR(36) NOT NULL,
  score TINYINT UNSIGNED NOT NULL DEFAULT 0, last_reviewed_at TIMESTAMP NULL, next_review_at TIMESTAMP NULL,
  calculation_metadata JSON, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_concept_mastery (user_id, concept_id), CHECK (score BETWEEN 0 AND 100),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (concept_id) REFERENCES concepts(id) ON DELETE CASCADE
);
CREATE TABLE audit_logs (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()), user_id CHAR(36), entity_type VARCHAR(50) NOT NULL,
  entity_id CHAR(36) NOT NULL, action VARCHAR(100) NOT NULL, old_value JSON, new_value JSON,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

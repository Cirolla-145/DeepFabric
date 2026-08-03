-- Run once on databases created before this migration.
ALTER TABLE attempts ADD COLUMN concept_id CHAR(36) NULL AFTER question_id;

-- Existing attempts retain the concept their question belongs to at migration time.
UPDATE attempts a
JOIN questions q ON q.id = a.question_id
SET a.concept_id = q.concept_id
WHERE a.concept_id IS NULL;

ALTER TABLE attempts MODIFY concept_id CHAR(36) NOT NULL;
ALTER TABLE attempts
  ADD CONSTRAINT fk_attempts_concept
  FOREIGN KEY (concept_id) REFERENCES concepts(id) ON DELETE RESTRICT;

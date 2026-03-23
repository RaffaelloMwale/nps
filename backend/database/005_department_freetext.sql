-- ============================================================
-- MIGRATION 005: Add free-text department column
-- Allows department to be entered as plain text (like
-- designation_at_retirement) rather than requiring a FK match.
-- ============================================================
SET search_path TO nps, public;

ALTER TABLE nps.pensioners
  ADD COLUMN IF NOT EXISTS department_text VARCHAR(300);

-- Back-fill from the joined departments table for existing records
UPDATE nps.pensioners p
SET    department_text = d.name
FROM   nps.departments d
WHERE  p.department_id = d.id
  AND  p.department_text IS NULL;

SELECT 'Migration 005 applied' AS result;

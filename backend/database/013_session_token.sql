-- ============================================================
-- MIGRATION 013: Single active session per user
-- Adds session_token column to system_users.
-- Each login overwrites this token, invalidating all others.
-- ============================================================
SET search_path TO nps, public;

ALTER TABLE nps.system_users
  ADD COLUMN IF NOT EXISTS session_token VARCHAR(64);

CREATE INDEX IF NOT EXISTS idx_users_session_token
  ON nps.system_users(session_token)
  WHERE session_token IS NOT NULL;

SELECT 'Migration 013 applied — session_token column added' AS result;

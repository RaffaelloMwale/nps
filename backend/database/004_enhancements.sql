-- ============================================================
-- MIGRATION 004: Enhancements
-- - Add designation_at_retirement, grade_at_retirement, grade_at_first_appointment
-- - Add arrear_category for pension gap / underpayment tracking
-- - Add system_settings new keys (maintenance_mode, theme)
-- - Add deceased_category to pensioners
-- ============================================================

SET search_path TO nps, public;

-- ── Pensioner: Employment fields at retirement ────────────────
ALTER TABLE nps.pensioners
  ADD COLUMN IF NOT EXISTS designation_at_retirement  VARCHAR(200),
  ADD COLUMN IF NOT EXISTS grade_at_retirement        VARCHAR(20),
  ADD COLUMN IF NOT EXISTS grade_at_first_appointment VARCHAR(20);

-- ── Pensioner: deceased_on_entry flag ────────────────────────
-- deceased_on_entry = TRUE means they were recorded as dead at the time
-- of being entered into the system (never received pension payments)
ALTER TABLE nps.pensioners
  ADD COLUMN IF NOT EXISTS deceased_on_entry BOOLEAN NOT NULL DEFAULT FALSE;

-- ── System settings: maintenance mode and theme ───────────────
INSERT INTO nps.system_settings (setting_key, setting_value, description) VALUES
  ('system.maintenance_mode',  'false',    'When true, only admins can access the system'),
  ('system.primary_color',     '#1E3A5F',  'Primary brand colour (hex)'),
  ('system.secondary_color',   '#C9A84C',  'Secondary / accent brand colour (hex)'),
  ('system.logo_text',         'NPS',      'Short logo text shown in sidebar'),
  ('system.footer_text',       'Government of Malawi — National Pension System', 'Footer/header text')
ON CONFLICT (setting_key) DO NOTHING;

-- ── Index for deceased queries ────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_pensioners_deceased
  ON nps.pensioners(status, date_of_death)
  WHERE status = 'deceased';

CREATE INDEX IF NOT EXISTS idx_pensioners_deceased_on_entry
  ON nps.pensioners(deceased_on_entry)
  WHERE deceased_on_entry = TRUE;

SELECT 'Migration 004 applied' AS result;

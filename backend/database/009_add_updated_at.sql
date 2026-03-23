-- ============================================================
-- MIGRATION 009: Add missing updated_at columns
-- ============================================================
SET search_path TO nps, public;

-- pension_payment_runs
ALTER TABLE nps.pension_payment_runs
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- pension_payment_lines (add too in case it's missing)
ALTER TABLE nps.pension_payment_lines
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- arrears (add in case missing)
ALTER TABLE nps.arrears
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Auto-update triggers
CREATE OR REPLACE FUNCTION nps.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

-- payment runs
DROP TRIGGER IF EXISTS trg_payment_runs_updated_at ON nps.pension_payment_runs;
CREATE TRIGGER trg_payment_runs_updated_at
  BEFORE UPDATE ON nps.pension_payment_runs
  FOR EACH ROW EXECUTE FUNCTION nps.set_updated_at();

-- payment lines
DROP TRIGGER IF EXISTS trg_payment_lines_updated_at ON nps.pension_payment_lines;
CREATE TRIGGER trg_payment_lines_updated_at
  BEFORE UPDATE ON nps.pension_payment_lines
  FOR EACH ROW EXECUTE FUNCTION nps.set_updated_at();

-- arrears
DROP TRIGGER IF EXISTS trg_arrears_updated_at ON nps.arrears;
CREATE TRIGGER trg_arrears_updated_at
  BEFORE UPDATE ON nps.arrears
  FOR EACH ROW EXECUTE FUNCTION nps.set_updated_at();

SELECT 'Migration 009 applied — updated_at columns added to payment tables' AS result;

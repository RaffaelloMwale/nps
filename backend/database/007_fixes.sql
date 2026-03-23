-- ============================================================
-- MIGRATION 007: Fix two errors
-- 1. Add updated_at column to gratuity_records (missing)
-- 2. Ensure v_gratuity_balance uses nps. schema prefix
-- ============================================================
SET search_path TO nps, public;

-- ── Fix 1: Add updated_at to gratuity_records ────────────────
ALTER TABLE nps.gratuity_records
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Auto-update trigger for updated_at
CREATE OR REPLACE FUNCTION nps.set_gratuity_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_gratuity_updated_at ON nps.gratuity_records;
CREATE TRIGGER trg_gratuity_updated_at
  BEFORE UPDATE ON nps.gratuity_records
  FOR EACH ROW EXECUTE FUNCTION nps.set_gratuity_updated_at();

-- ── Fix 2: Recreate v_gratuity_balance with explicit nps. schema ──
DROP VIEW IF EXISTS nps.v_partial_gratuity_recipients CASCADE;
DROP VIEW IF EXISTS nps.v_gratuity_due               CASCADE;
DROP VIEW IF EXISTS nps.v_gratuity_balance            CASCADE;

CREATE VIEW nps.v_gratuity_balance AS
SELECT
    p.id          AS pensioner_id,
    p.pension_no,
    p.employee_no,
    TRIM(CONCAT_WS(' ', p.first_name, p.last_name))   AS full_name,
    p.department_text                                  AS department_name,
    p.total_gratuity_due,
    COALESCE(p.pre_retirement_gratuity_paid, 0)                               AS pre_retirement_gratuity_paid,
    COALESCE(paid.system_paid, 0)                                             AS system_gratuity_paid,
    COALESCE(p.pre_retirement_gratuity_paid, 0) + COALESCE(paid.system_paid, 0)   AS total_gratuity_paid,
    p.total_gratuity_due
      - COALESCE(p.pre_retirement_gratuity_paid, 0)
      - COALESCE(paid.system_paid, 0)                                         AS gratuity_balance_remaining,
    COALESCE(paid.partial_count, 0)                                           AS partial_payments_count,
    COALESCE(paid.full_count,    0)                                           AS full_payments_count,
    paid.first_paid_date,
    paid.last_paid_date
FROM nps.pensioners p
LEFT JOIN (
    SELECT
        pensioner_id,
        COALESCE(SUM(amount_requested), 0)                                        AS system_paid,
        COUNT(*) FILTER (WHERE is_partial = TRUE  AND status = 'paid')           AS partial_count,
        COUNT(*) FILTER (WHERE is_partial = FALSE AND status = 'paid')           AS full_count,
        MIN(paid_at)::DATE                                                        AS first_paid_date,
        MAX(paid_at)::DATE                                                        AS last_paid_date
    FROM nps.gratuity_records
    WHERE status = 'paid'
    GROUP BY pensioner_id
) paid ON paid.pensioner_id = p.id;

CREATE VIEW nps.v_gratuity_due AS
SELECT * FROM nps.v_gratuity_balance
WHERE gratuity_balance_remaining > 0
ORDER BY gratuity_balance_remaining DESC;

CREATE VIEW nps.v_partial_gratuity_recipients AS
SELECT
    gb.*,
    gr_list.partial_amounts,
    gr_list.partial_dates
FROM nps.v_gratuity_balance gb
LEFT JOIN (
    SELECT
        pensioner_id,
        STRING_AGG(amount_requested::TEXT, ', ' ORDER BY paid_at) AS partial_amounts,
        STRING_AGG(paid_at::DATE::TEXT,    ', ' ORDER BY paid_at) AS partial_dates
    FROM nps.gratuity_records
    WHERE is_partial = TRUE AND status = 'paid'
    GROUP BY pensioner_id
) gr_list ON gr_list.pensioner_id = gb.pensioner_id
WHERE gb.partial_payments_count > 0
   OR gb.pre_retirement_gratuity_paid > 0;

SELECT 'Migration 007 applied — updated_at added + views fixed' AS result;

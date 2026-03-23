-- ============================================================
-- MIGRATION 006: Gratuity IFMIS TRF + Pre-Retirement Partial
-- ============================================================
SET search_path TO nps, public;

-- On gratuity_records: IFMIS transfer reference number
ALTER TABLE nps.gratuity_records
  ADD COLUMN IF NOT EXISTS ifmis_trf_number   VARCHAR(100),
  ADD COLUMN IF NOT EXISTS gratuity_received  BOOLEAN NOT NULL DEFAULT FALSE;

-- On pensioners: pre-retirement partial gratuity
-- If a pensioner received a partial gratuity BEFORE retirement, record it here.
-- The system will automatically deduct this from total_gratuity_due when
-- calculating the final outstanding balance.
ALTER TABLE nps.pensioners
  ADD COLUMN IF NOT EXISTS pre_retirement_gratuity_paid   NUMERIC(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pre_retirement_gratuity_reason TEXT;

-- Comment
COMMENT ON COLUMN nps.pensioners.pre_retirement_gratuity_paid IS
  'Amount of gratuity paid to the officer BEFORE retirement (pre-retirement partial).
   This is deducted from total_gratuity_due to arrive at the net outstanding balance.';

COMMENT ON COLUMN nps.gratuity_records.ifmis_trf_number IS
  'IFMIS Transfer Reference Number recorded when payment is confirmed.';

COMMENT ON COLUMN nps.gratuity_records.gratuity_received IS
  'TRUE when the pensioner/beneficiary has confirmed receipt of the gratuity payment.';

-- Update the gratuity balance view to account for pre-retirement partial
CREATE OR REPLACE VIEW nps.v_gratuity_balance AS
SELECT
    p.id          AS pensioner_id,
    p.pension_no,
    p.employee_no,
    TRIM(CONCAT_WS(' ', p.first_name, p.last_name)) AS full_name,
    p.department_text AS department_name,
    p.total_gratuity_due,
    -- Pre-retirement partial already paid before entering the system
    COALESCE(p.pre_retirement_gratuity_paid, 0)                         AS pre_retirement_gratuity_paid,
    -- Gratuity paid via this system (paid records)
    COALESCE(paid.system_paid, 0)                                       AS system_gratuity_paid,
    -- Total paid = pre-retirement + system paid
    COALESCE(p.pre_retirement_gratuity_paid, 0) +
      COALESCE(paid.system_paid, 0)                                     AS total_gratuity_paid,
    -- Balance = total due - total paid
    p.total_gratuity_due -
      COALESCE(p.pre_retirement_gratuity_paid, 0) -
      COALESCE(paid.system_paid, 0)                                     AS gratuity_balance_remaining,
    COALESCE(paid.partial_count, 0)                                     AS partial_payments_count,
    COALESCE(paid.full_count, 0)                                        AS full_payments_count,
    paid.first_paid_date,
    paid.last_paid_date
FROM nps.pensioners p
LEFT JOIN (
    SELECT
        pensioner_id,
        COALESCE(SUM(amount_requested), 0)                               AS system_paid,
        COUNT(*) FILTER (WHERE is_partial = TRUE  AND status = 'paid')  AS partial_count,
        COUNT(*) FILTER (WHERE is_partial = FALSE AND status = 'paid')  AS full_count,
        MIN(paid_at)::DATE                                               AS first_paid_date,
        MAX(paid_at)::DATE                                               AS last_paid_date
    FROM nps.gratuity_records
    WHERE status = 'paid'
    GROUP BY pensioner_id
) paid ON paid.pensioner_id = p.id;

-- Re-create the gratuity due and partial views
CREATE OR REPLACE VIEW nps.v_gratuity_due AS
SELECT * FROM nps.v_gratuity_balance
WHERE gratuity_balance_remaining > 0
ORDER BY gratuity_balance_remaining DESC;

CREATE OR REPLACE VIEW nps.v_partial_gratuity_recipients AS
SELECT
    gb.*,
    gr_list.partial_amounts,
    gr_list.partial_dates
FROM nps.v_gratuity_balance gb
JOIN (
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

SELECT 'Migration 006 applied' AS result;

-- ============================================================
-- MIGRATION 011: Fix runs that have no payment lines
-- Re-inserts lines from current active pensioners for any run
-- that has 0 lines, then updates the run totals.
-- NOTE: This is a best-effort fix. The lines will reflect
-- pensioners active RIGHT NOW, not on the original run date.
-- For accurate historical data, delete and recreate those runs.
-- ============================================================
SET search_path TO nps, public;

DO $$
DECLARE
  r   RECORD;
  cnt INT;
BEGIN
  FOR r IN
    SELECT pr.id, pr.run_code, pr.payment_period
    FROM nps.pension_payment_runs pr
    WHERE NOT EXISTS (
      SELECT 1 FROM nps.pension_payment_lines ppl WHERE ppl.run_id = pr.id
    )
    ORDER BY pr.payment_year DESC, pr.payment_month DESC
  LOOP
    RAISE NOTICE 'Fixing run % (%)', r.run_code, r.payment_period;

    INSERT INTO nps.pension_payment_lines
      (run_id, pensioner_id, bank_account_id, gross_amount, status)
    SELECT r.id, p.id, ba.id, p.monthly_pension, 'pending'
    FROM nps.pensioners p
    LEFT JOIN nps.bank_accounts ba
      ON ba.pensioner_id = p.id AND ba.is_primary = TRUE AND ba.is_active = TRUE
    WHERE p.status = 'active'
      AND p.monthly_pension > 0;

    GET DIAGNOSTICS cnt = ROW_COUNT;
    RAISE NOTICE '  → Inserted % lines', cnt;

    -- Update run header totals
    UPDATE nps.pension_payment_runs
    SET total_pensioners   = cnt,
        total_gross_amount = (
          SELECT COALESCE(SUM(gross_amount),0)
          FROM nps.pension_payment_lines WHERE run_id = r.id
        ),
        total_net_amount   = (
          SELECT COALESCE(SUM(gross_amount),0)
          FROM nps.pension_payment_lines WHERE run_id = r.id
        )
    WHERE id = r.id;
  END LOOP;
END $$;

-- Also fix any runs where lines exist but totals are still NULL/0
UPDATE nps.pension_payment_runs pr
SET
  total_pensioners   = lines.cnt,
  total_gross_amount = lines.gross,
  total_net_amount   = lines.gross
FROM (
  SELECT run_id,
         COUNT(*)                         AS cnt,
         COALESCE(SUM(gross_amount), 0)   AS gross
  FROM nps.pension_payment_lines
  GROUP BY run_id
) lines
WHERE lines.run_id = pr.id
  AND (pr.total_pensioners IS NULL OR pr.total_pensioners = 0
    OR pr.total_gross_amount IS NULL OR pr.total_gross_amount = 0);

-- Final check
SELECT run_code, payment_period,
       total_pensioners,
       total_gross_amount,
       (SELECT COUNT(*) FROM nps.pension_payment_lines WHERE run_id = pr.id) AS actual_lines
FROM nps.pension_payment_runs pr
ORDER BY payment_year DESC, payment_month DESC;

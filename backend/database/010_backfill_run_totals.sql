-- ============================================================
-- MIGRATION 010: Backfill total_pensioners and total_gross_amount
-- for all existing payment runs that have NULL totals
-- ============================================================
SET search_path TO nps, public;

UPDATE nps.pension_payment_runs pr
SET
  total_pensioners   = lines.cnt,
  total_gross_amount = lines.gross,
  total_net_amount   = lines.gross
FROM (
  SELECT run_id,
         COUNT(*)           AS cnt,
         COALESCE(SUM(gross_amount), 0) AS gross
  FROM nps.pension_payment_lines
  GROUP BY run_id
) lines
WHERE lines.run_id = pr.id
  AND (pr.total_pensioners IS NULL OR pr.total_gross_amount IS NULL);

SELECT
  run_code,
  payment_period,
  total_pensioners,
  total_gross_amount
FROM nps.pension_payment_runs
ORDER BY payment_year DESC, payment_month DESC;

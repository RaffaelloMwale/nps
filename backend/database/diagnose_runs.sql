-- Check what's in the payment runs and lines
SET search_path TO nps, public;

-- 1. Show all runs with their stored totals
SELECT run_code, payment_period, status,
       total_pensioners, total_gross_amount,
       created_at
FROM nps.pension_payment_runs
ORDER BY payment_year DESC, payment_month DESC;

-- 2. Count lines per run
SELECT pr.run_code, pr.payment_period,
       COUNT(ppl.id)            AS line_count,
       COALESCE(SUM(ppl.gross_amount),0) AS lines_total
FROM nps.pension_payment_runs pr
LEFT JOIN nps.pension_payment_lines ppl ON ppl.run_id = pr.id
GROUP BY pr.run_code, pr.payment_period
ORDER BY pr.payment_period DESC;

-- 3. Count active pensioners right now
SELECT COUNT(*) AS active_pensioners_now,
       COALESCE(SUM(monthly_pension),0) AS total_monthly_now
FROM nps.pensioners
WHERE status = 'active';

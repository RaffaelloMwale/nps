import { Router, Response, NextFunction } from 'express';
import { query } from '../../config/database';
import { authenticate, AuthRequest } from '../../middlewares/auth.middleware';
import { anyRole } from '../../middlewares/rbac.middleware';
import { success } from '../../utils/responseHelper';

const router = Router();
router.use(authenticate, anyRole);

// GET /api/dashboard/overview
router.get('/overview', async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const [
      totalRegistered,       // 1. Everyone ever registered (dead or alive)
      totalActive,           // 2. Active pensioners alive today
      totalDeceased,         // Total deceased (for info)
      introducedThisMonth,   // 3. Introduced this month (all statuses)
      pendingRuns,
      pendingGratuity,
      pendingArrears,
      currentMonthFromRun,   // 4. Current month payout from payment run
      currentMonthFallback,  // 4. Fallback: sum of active monthly_pension
      ytdGratuity,           // 5. Gratuity YTD paid (all pensioners, all time sum for year)
      gratuityBalance,       // 6. Outstanding gratuity balance (not yet paid)
      totalMonthlyPayroll,
      arrearsPaid,
    ] = await Promise.all([

      // 1. Total REGISTERED — everyone in the system dead or alive
      query(`SELECT COUNT(*) FROM nps.pensioners`),

      // 2. Active pensioners alive today
      query(`SELECT COUNT(*) FROM nps.pensioners WHERE status = 'active'`),

      // Total deceased
      query(`SELECT COUNT(*) FROM nps.pensioners WHERE status = 'deceased'`),

      // 3. Introduced this month — any status, introduced in current month
      query(`
        SELECT COUNT(*) FROM nps.pensioners
        WHERE EXTRACT(MONTH FROM created_at) = EXTRACT(MONTH FROM NOW())
          AND EXTRACT(YEAR  FROM created_at) = EXTRACT(YEAR  FROM NOW())
      `),

      // Pending payment runs
      query(`
        SELECT COUNT(*) FROM nps.pension_payment_runs
        WHERE status IN ('pending','submitted','approved_1')
      `),

      // Pending gratuity
      query(`
        SELECT COUNT(*) FROM nps.gratuity_records
        WHERE status IN ('pending','submitted','approved_1')
      `),

      // Pending arrears
      query(`SELECT COUNT(*) FROM nps.arrears WHERE status = 'pending'`),

      // 4. Current month payout — from payment run if it exists
      query(`
        SELECT COALESCE(SUM(ppl.gross_amount), 0) AS total,
               pr.status AS run_status,
               pr.run_code,
               COUNT(ppl.id) AS line_count
        FROM nps.pension_payment_runs pr
        JOIN nps.pension_payment_lines ppl ON ppl.run_id = pr.id
        WHERE pr.payment_month = EXTRACT(MONTH FROM NOW())::int
          AND pr.payment_year  = EXTRACT(YEAR  FROM NOW())::int
        GROUP BY pr.status, pr.run_code
        ORDER BY
          CASE pr.status
            WHEN 'processed'  THEN 1
            WHEN 'approved_2' THEN 2
            WHEN 'approved_1' THEN 3
            WHEN 'submitted'  THEN 4
            ELSE 5
          END
        LIMIT 1
      `),

      // 4. Fallback: sum of ALL ACTIVE pensioners' monthly_pension
      // Only active pensioners (alive today) count toward current month payout
      query(`
        SELECT COALESCE(SUM(monthly_pension), 0) AS total,
               COUNT(*) AS pensioner_count
        FROM nps.pensioners
        WHERE status = 'active'
      `),

      // 5. Gratuity Paid — ALL TIME across all registered pensioners
      //    Rule: 1 pensioner = 1 payment.
      //    Partials count as 1 payment ONLY when no full payment exists yet.
      //    Once a full payment is made for a pensioner, partials are excluded from count.
      query(`
        WITH per_pensioner AS (
          -- For each pensioner: classify whether they have a full payment or only partials
          SELECT
            pensioner_id,
            SUM(amount_requested)                                              AS total_paid,
            MAX(CASE WHEN gratuity_received = TRUE THEN 1 ELSE 0 END)         AS any_received,
            -- Has a full (non-partial) paid record?
            MAX(CASE WHEN is_partial = FALSE THEN 1 ELSE 0 END)               AS has_full_payment,
            -- Count of partial payments
            COUNT(*) FILTER (WHERE is_partial = TRUE)                         AS partial_count
          FROM nps.gratuity_records
          WHERE status = 'paid'
          GROUP BY pensioner_id
        )
        SELECT
          -- Total amount: sum of ALL payments (partials + full)
          COALESCE(SUM(total_paid), 0)                                                  AS total,
          -- Received: sum where at least one payment was confirmed received
          COALESCE(SUM(CASE WHEN any_received = 1 THEN total_paid ELSE 0 END), 0)      AS received_total,
          -- Count of pensioners paid:
          --   If they have a full payment → count as 1 (full payment)
          --   If they only have partials  → count as 1 (partial in progress)
          COUNT(*)                                                                       AS pensioners_paid_count,
          -- Payment count = same as pensioner count (1 per person)
          COUNT(*)                                                                       AS payment_count,
          -- Pending receipt: pensioners whose payment is not yet confirmed received
          COUNT(*) FILTER (WHERE any_received = 0)                                      AS pending_receipt_count
        FROM per_pensioner
      `),

      // 6. Outstanding gratuity balance — sum of what has NOT been paid yet
      //    across all pensioners (includes deceased with unpaid balance)
      query(`
        SELECT
          COALESCE(SUM(gratuity_balance_remaining), 0) AS total,
          COUNT(*) FILTER (WHERE gratuity_balance_remaining > 0) AS count_with_balance
        FROM nps.v_gratuity_balance
      `),

      // Total monthly payroll (always-on for subtitle)
      query(`
        SELECT COALESCE(SUM(monthly_pension), 0) AS total
        FROM nps.pensioners WHERE status = 'active'
      `),

      // Total arrears paid (all time)
      query(`
        SELECT
          COALESCE(SUM(paid_amount), 0) AS total,
          COUNT(*) FILTER (WHERE status='paid') AS count_paid
        FROM nps.arrears
        WHERE status = 'paid'
      `),
    ]);

    const runExists         = currentMonthFromRun.rows.length > 0;
    const currentMonthPayout = runExists
      ? parseFloat(currentMonthFromRun.rows[0].total)
      : parseFloat(currentMonthFallback.rows[0].total);
    const payoutSource = runExists
      ? `From ${currentMonthFromRun.rows[0].run_code} (${currentMonthFromRun.rows[0].run_status})`
      : `Sum of ${currentMonthFallback.rows[0].pensioner_count} active pensioners`;

    success(res, {
      // KPI cards
      totalRegistered:          parseInt(totalRegistered.rows[0].count),   // 1
      totalActivePensioners:    parseInt(totalActive.rows[0].count),        // 2
      totalDeceased:            parseInt(totalDeceased.rows[0].count),
      introducedThisMonth:      parseInt(introducedThisMonth.rows[0].count),// 3
      currentMonthPayout,                                                    // 4
      payoutSource,
      payoutFromRun: runExists,
      totalMonthlyPayroll:      parseFloat(totalMonthlyPayroll.rows[0].total),

      gratuityPaid:             parseFloat(ytdGratuity.rows[0].total),           // 5
      gratuityPaidCount:        parseInt(ytdGratuity.rows[0].pensioners_paid_count),
      gratuityPaymentCount:     parseInt(ytdGratuity.rows[0].payment_count),
      gratuityReceived:         parseFloat(ytdGratuity.rows[0].received_total),
      gratuityPendingReceipt:   parseInt(ytdGratuity.rows[0].pending_receipt_count),

      outstandingGratuityTotal: parseFloat(gratuityBalance.rows[0].total),  // 6
      outstandingGratuityCount: parseInt(gratuityBalance.rows[0].count_with_balance),

      // Arrears paid
      totalArrearsPaid:       parseFloat(arrearsPaid.rows[0].total),
      totalArrearsPaidCount:  parseInt(arrearsPaid.rows[0].count_paid),

      // Pending actions
      pendingApprovals:
        parseInt(pendingRuns.rows[0].count) +
        parseInt(pendingGratuity.rows[0].count) +
        parseInt(pendingArrears.rows[0].count),
    });
  } catch (err) { next(err); }
});

// GET /api/dashboard/drilldown/:type
// Returns the list of pensioners backing each KPI card.
// :type = registered | active | deceased | introduced | gratuity-balance
router.get('/drilldown/:type', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { type } = req.params;
    const page  = parseInt(req.query.page  as string || '1');
    const limit = parseInt(req.query.limit as string || '20');
    const offset = (page - 1) * limit;

    let where = '';
    let title = '';

    switch (type) {
      case 'registered':
        where = '1=1';
        title = 'All Registered Pensioners';
        break;
      case 'active':
        where = "p.status = 'active'";
        title = 'Active Pensioners';
        break;
      case 'deceased':
        where = "p.status = 'deceased'";
        title = 'Deceased Pensioners';
        break;
      case 'introduced':
        where = `EXTRACT(MONTH FROM p.created_at) = EXTRACT(MONTH FROM NOW())
                 AND EXTRACT(YEAR FROM p.created_at) = EXTRACT(YEAR FROM NOW())`;
        title = 'Introduced This Month';
        break;
      case 'gratuity-balance':
        // Handled separately via gratuity view
        const gbCount = await query(
          `SELECT COUNT(*) FROM nps.v_gratuity_balance WHERE gratuity_balance_remaining > 0`
        );
        const gbRows = await query(
          `SELECT gb.pensioner_id AS id, gb.pension_no, gb.full_name,
                  gb.department_name, gb.total_gratuity_due,
                  gb.total_gratuity_paid, gb.gratuity_balance_remaining,
                  gb.pre_retirement_gratuity_paid,
                  p.created_at AS date_of_entry
           FROM nps.v_gratuity_balance gb
           JOIN nps.pensioners p ON p.id = gb.pensioner_id
           WHERE gb.gratuity_balance_remaining > 0
           ORDER BY p.created_at ASC
           LIMIT $1 OFFSET $2`,
          [limit, offset]
        );
        return success(res, {
          title: 'Outstanding Gratuity Balance',
          total: parseInt(gbCount.rows[0].count),
          page, limit,
          totalPages: Math.ceil(parseInt(gbCount.rows[0].count) / limit),
          rows: gbRows.rows,
        });
      case 'pending-approvals':
        // Returns all pending items across payment runs, gratuity, arrears
        const paRuns = await query(`
          SELECT 'payment_run' AS item_type, pr.id, pr.run_code AS ref,
                 pr.payment_period AS description,
                 pr.total_gross_amount AS amount,
                 pr.status, pr.created_at,
                 u.full_name AS created_by_name
          FROM nps.pension_payment_runs pr
          LEFT JOIN nps.system_users u ON pr.created_by = u.id
          WHERE pr.status IN ('pending','submitted','approved_1')
          ORDER BY pr.created_at ASC
        `);
        const paGratuity = await query(`
          SELECT 'gratuity' AS item_type, gr.id, gr.gratuity_ref AS ref,
                 CONCAT(p.first_name,' ',p.last_name,' — ',gr.gratuity_type) AS description,
                 gr.amount_requested AS amount,
                 gr.status, gr.created_at,
                 u.full_name AS created_by_name
          FROM nps.gratuity_records gr
          JOIN nps.pensioners p ON gr.pensioner_id = p.id
          LEFT JOIN nps.system_users u ON gr.created_by = u.id
          WHERE gr.status IN ('pending','submitted','approved_1')
          ORDER BY gr.created_at ASC
        `);
        const paArrears = await query(`
          SELECT 'arrear' AS item_type, a.id, a.arrear_ref AS ref,
                 CONCAT(p.first_name,' ',p.last_name,' — ',a.arrear_type) AS description,
                 a.computed_amount AS amount,
                 a.status, a.created_at,
                 u.full_name AS created_by_name
          FROM nps.arrears a
          JOIN nps.pensioners p ON a.pensioner_id = p.id
          LEFT JOIN nps.system_users u ON a.created_by = u.id
          WHERE a.status = 'pending'
          ORDER BY a.created_at ASC
        `);
        const paAll = [
          ...paRuns.rows,
          ...paGratuity.rows,
          ...paArrears.rows,
        ].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        return success(res, {
          title: 'Pending Approvals',
          total: paAll.length,
          page: 1,
          limit: paAll.length,
          totalPages: 1,
          rows: paAll,
        });

      case 'gratuity-paid':
        // One row per pensioner.
        // Show the full payment if it exists, otherwise the most recent partial.
        // Total amount = SUM of all paid records for that pensioner.
        const gpCount = await query(
          `SELECT COUNT(DISTINCT pensioner_id) FROM nps.gratuity_records WHERE status='paid'`
        );
        const gpRows = await query(
          `SELECT DISTINCT ON (gr.pensioner_id)
                  gr.pensioner_id AS id,
                  p.pension_no, p.department_text AS department_name,
                  p.designation_at_retirement,
                  CONCAT(p.first_name,' ',p.last_name) AS full_name,
                  p.created_at AS date_of_entry,
                  -- Ref: prefer the full payment ref, fall back to most recent partial
                  gr.gratuity_ref AS ref,
                  gr.gratuity_type,
                  -- Amount = total of ALL paid records for this pensioner
                  totals.total_paid AS amount,
                  gr.ifmis_trf_number,
                  totals.any_received AS gratuity_received,
                  gr.paid_at,
                  -- Show payment type label
                  CASE
                    WHEN totals.has_full = 1 THEN 'Full'
                    ELSE CONCAT(totals.partial_count::text, ' Partial(s)')
                  END AS payment_label
           FROM nps.gratuity_records gr
           JOIN nps.pensioners p ON gr.pensioner_id = p.id
           JOIN (
             SELECT pensioner_id,
                    SUM(amount_requested)                                    AS total_paid,
                    MAX(CASE WHEN is_partial=FALSE THEN 1 ELSE 0 END)       AS has_full,
                    COUNT(*) FILTER (WHERE is_partial=TRUE)                 AS partial_count,
                    MAX(CASE WHEN gratuity_received=TRUE THEN 1 ELSE 0 END) AS any_received
             FROM nps.gratuity_records WHERE status='paid'
             GROUP BY pensioner_id
           ) totals ON totals.pensioner_id = gr.pensioner_id
           WHERE gr.status = 'paid'
           ORDER BY gr.pensioner_id,
                    -- Prefer full payment row; among partials pick the most recent
                    CASE WHEN gr.is_partial=FALSE THEN 0 ELSE 1 END ASC,
                    gr.paid_at DESC
           LIMIT $1 OFFSET $2`,
          [limit, offset]
        );
        return success(res, {
          title: 'Gratuity Payments — 1 per Pensioner',
          total: parseInt(gpCount.rows[0].count),
          page, limit,
          totalPages: Math.ceil(parseInt(gpCount.rows[0].count) / limit),
          rows: gpRows.rows,
        });

      case 'arrears-paid':
        const apCount = await query(
          `SELECT COUNT(*) FROM nps.arrears WHERE status='paid'`
        );
        const apRows = await query(
          `SELECT a.id, a.arrear_ref, a.arrear_type, a.description,
                  a.from_period, a.to_period,
                  a.computed_amount, a.paid_amount,
                  a.paid_at, a.payment_ref,
                  CONCAT(p.first_name,' ',p.last_name) AS full_name,
                  p.pension_no, p.department_text AS department_name,
                  p.designation_at_retirement,
                  p.created_at AS date_of_entry
           FROM nps.arrears a
           JOIN nps.pensioners p ON a.pensioner_id = p.id
           WHERE a.status = 'paid'
           ORDER BY a.paid_at DESC
           LIMIT $1 OFFSET $2`,
          [limit, offset]
        );
        return success(res, {
          title: 'Arrears Paid',
          total: parseInt(apCount.rows[0].count),
          page, limit,
          totalPages: Math.ceil(parseInt(apCount.rows[0].count) / limit),
          rows: apRows.rows,
        });

      default:
        return success(res, { title: '', total: 0, rows: [] });
    }

    const countRes = await query(
      `SELECT COUNT(*) FROM nps.pensioners p WHERE ${where}`
    );
    const total = parseInt(countRes.rows[0].count);

    const dataRes = await query(
      `SELECT p.id, p.pension_no, p.employee_no,
              CONCAT(COALESCE(p.title||' ',''), p.first_name, ' ', p.last_name) AS full_name,
              p.status, p.department_text AS department_name,
              p.designation_at_retirement,
              p.monthly_pension, p.total_gratuity_due,
              p.pension_start_date, p.date_of_retirement, p.date_of_death,
              p.created_at AS registered_date
       FROM nps.pensioners p
       WHERE ${where}
       ORDER BY p.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    success(res, {
      title,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      rows: dataRes.rows,
    });
  } catch (err) { next(err); }
});

// GET /api/dashboard/charts/monthly-payments
router.get('/charts/monthly-payments', async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const processedRuns = await query(`
      SELECT
        payment_year  AS year,
        payment_month AS month,
        TO_CHAR(TO_DATE(payment_month::text, 'MM'), 'Mon') AS month_name,
        COALESCE(total_net_amount, 0)   AS net_amount,
        COALESCE(total_gross_amount, 0) AS gross_amount,
        COALESCE(total_pensioners, 0)   AS pensioner_count,
        'processed' AS source
      FROM nps.pension_payment_runs
      WHERE status = 'processed'
        AND (payment_year * 100 + payment_month) >=
            (EXTRACT(YEAR FROM NOW() - INTERVAL '11 months')::int * 100 +
             EXTRACT(MONTH FROM NOW() - INTERVAL '11 months')::int)
      ORDER BY payment_year, payment_month
    `);

    const pendingCurrentMonth = await query(`
      SELECT
        pr.payment_year  AS year,
        pr.payment_month AS month,
        TO_CHAR(TO_DATE(pr.payment_month::text, 'MM'), 'Mon') AS month_name,
        COALESCE(SUM(ppl.net_amount),   0) AS net_amount,
        COALESCE(SUM(ppl.gross_amount), 0) AS gross_amount,
        COUNT(ppl.id)                      AS pensioner_count,
        pr.status                          AS source
      FROM nps.pension_payment_runs pr
      JOIN nps.pension_payment_lines ppl ON ppl.run_id = pr.id
      WHERE pr.payment_month = EXTRACT(MONTH FROM NOW())::int
        AND pr.payment_year  = EXTRACT(YEAR  FROM NOW())::int
        AND pr.status NOT IN ('processed', 'reversed')
      GROUP BY pr.payment_year, pr.payment_month, pr.status
      LIMIT 1
    `);

    const now = new Date();
    const hasCurrentMonth =
      processedRuns.rows.some(r => r.month == now.getMonth() + 1 && r.year == now.getFullYear()) ||
      pendingCurrentMonth.rows.length > 0;

    let allRows = [...processedRuns.rows];
    if (pendingCurrentMonth.rows.length > 0) {
      allRows.push(pendingCurrentMonth.rows[0]);
    } else if (!hasCurrentMonth) {
      const projected = await query(`
        SELECT
          EXTRACT(YEAR  FROM NOW())::int AS year,
          EXTRACT(MONTH FROM NOW())::int AS month,
          TO_CHAR(NOW(), 'Mon')          AS month_name,
          COALESCE(SUM(monthly_pension), 0) AS net_amount,
          COALESCE(SUM(monthly_pension), 0) AS gross_amount,
          COUNT(*)                          AS pensioner_count,
          'projected'                       AS source
        FROM nps.pensioners WHERE status = 'active'
      `);
      allRows.push(projected.rows[0]);
    }

    success(res, allRows);
  } catch (err) { next(err); }
});

// GET /api/dashboard/charts/pensioner-status
router.get('/charts/pensioner-status', async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const res2 = await query(
      `SELECT status, COUNT(*) as count FROM nps.pensioners GROUP BY status ORDER BY count DESC`
    );
    success(res, res2.rows);
  } catch (err) { next(err); }
});

// GET /api/dashboard/charts/gratuity-summary
router.get('/charts/gratuity-summary', async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const res2 = await query(`
      SELECT
        COALESCE(SUM(total_gratuity_paid),        0) AS total_paid,
        COALESCE(SUM(gratuity_balance_remaining), 0) AS total_balance,
        COALESCE(SUM(total_gratuity_due),         0) AS total_entitlement
      FROM nps.v_gratuity_balance
    `);
    success(res, res2.rows[0]);
  } catch (err) { next(err); }
});

// GET /api/dashboard/charts/department-breakdown
router.get('/charts/department-breakdown', async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const res2 = await query(`
      SELECT department_text AS department, COUNT(*) AS count
      FROM nps.pensioners
      WHERE status = 'active' AND department_text IS NOT NULL AND department_text != ''
      GROUP BY department_text
      ORDER BY count DESC
      LIMIT 10
    `);
    success(res, res2.rows);
  } catch (err) { next(err); }
});

export default router;

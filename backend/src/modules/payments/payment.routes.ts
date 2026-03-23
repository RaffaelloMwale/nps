import { Router, Response, NextFunction } from 'express';
import { query } from '../../config/database';
import { authenticate, AuthRequest } from '../../middlewares/auth.middleware';
import { creatorOrAdmin, anyRole, approver1OrAdmin, approver2OrAdmin, adminOnly } from '../../middlewares/rbac.middleware';
import { success, created, paginated, notFound, badRequest, forbidden } from '../../utils/responseHelper';

const router = Router();
router.use(authenticate);

async function findRun(id: string) {
  const res = await query(
    `SELECT pr.*,
            u1.full_name AS created_by_name,
            u2.full_name AS submitted_by_name,
            u3.full_name AS approved_by_1_name,
            u4.full_name AS approved_by_2_name,
            (SELECT COUNT(*) FROM nps.pension_payment_lines WHERE run_id = pr.id) AS total_lines
     FROM nps.pension_payment_runs pr
     LEFT JOIN nps.system_users u1 ON pr.created_by    = u1.id
     LEFT JOIN nps.system_users u2 ON pr.submitted_by  = u2.id
     LEFT JOIN nps.system_users u3 ON pr.approved_by_1 = u3.id
     LEFT JOIN nps.system_users u4 ON pr.approved_by_2 = u4.id
     WHERE pr.id = $1`, [id]
  );
  return res.rows[0] || null;
}

// ── GET /api/payment-runs ────────────────────────────────────
router.get('/', anyRole, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const page   = parseInt(req.query.page  as string) || 1;
    const limit  = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;

    const countRes = await query(`SELECT COUNT(*) FROM nps.pension_payment_runs`);
    const total = parseInt(countRes.rows[0].count);

    const dataRes = await query(
      `SELECT pr.id, pr.run_code, pr.payment_period, pr.payment_month, pr.payment_year,
              pr.scheduled_date, pr.status, pr.is_auto_generated,
              pr.created_at, pr.processed_at,
              u1.full_name AS created_by_name,
              -- Always derive pensioner count and total from actual snapshotted lines
              -- This ensures the number reflects exactly who was active on run day
              (SELECT COUNT(*)           FROM nps.pension_payment_lines WHERE run_id = pr.id) AS pensioner_count,
              (SELECT COALESCE(SUM(gross_amount),0) FROM nps.pension_payment_lines WHERE run_id = pr.id) AS total_gross
       FROM nps.pension_payment_runs pr
       LEFT JOIN nps.system_users u1 ON pr.created_by = u1.id
       ORDER BY pr.payment_year DESC, pr.payment_month DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    paginated(res, dataRes.rows, total, page, limit);
  } catch (err) { next(err); }
});

// ── POST /api/payment-runs ───────────────────────────────────
router.post('/', creatorOrAdmin, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { month, year } = req.body;
    if (!month || !year) return badRequest(res, 'month and year are required');

    const existing = await query(
      `SELECT id FROM nps.pension_payment_runs WHERE payment_month=$1 AND payment_year=$2`,
      [month, year]
    );
    if (existing.rows.length) return badRequest(res, `Payment run for ${month}/${year} already exists`);

    // Get scheduled day from settings
    const dayRes = await query(
      `SELECT setting_value FROM nps.system_settings WHERE setting_key = 'payment.auto_run_day'`
    );
    const runDay = parseInt(dayRes.rows[0]?.setting_value || '14');

    const scheduledDate = new Date(year, month - 1, runDay);
    const period = `${year}-${String(month).padStart(2, '0')}`;
    const code   = `RUN-${year}-${String(month).padStart(2, '0')}`;

    const runRes = await query(
      `INSERT INTO nps.pension_payment_runs
         (run_code, payment_period, payment_month, payment_year, scheduled_date,
          status, is_auto_generated, created_by, description)
       VALUES ($1,$2,$3,$4,$5,'pending',false,$6,$7) RETURNING id`,
      [code, period, month, year, scheduledDate, req.user!.userId, `Monthly Pension Payment — ${period}`]
    );
    const runId = runRes.rows[0].id;

    // Snapshot: insert lines for all ACTIVE pensioners at this moment
    const lineRes = await query(
      `INSERT INTO nps.pension_payment_lines
         (run_id, pensioner_id, bank_account_id, gross_amount, status)
       SELECT $1, p.id, ba.id, p.monthly_pension, 'pending'
       FROM nps.pensioners p
       LEFT JOIN nps.bank_accounts ba
         ON ba.pensioner_id = p.id AND ba.is_primary = TRUE AND ba.is_active = TRUE
       WHERE p.status = 'active'`,
      [runId]
    );

    // Update totals on the run header
    await query(
      `UPDATE nps.pension_payment_runs
       SET total_pensioners   = $1,
           total_gross_amount = (SELECT SUM(gross_amount) FROM nps.pension_payment_lines WHERE run_id = $2),
           total_net_amount   = (SELECT SUM(gross_amount) FROM nps.pension_payment_lines WHERE run_id = $2)
       WHERE id = $2`,
      [lineRes.rowCount, runId]
    );

    const run = await findRun(runId);
    created(res, run, `Monthly Pension Payment run created — ${lineRes.rowCount} pensioners`);
  } catch (err) { next(err); }
});

// ── GET /api/payment-runs/:id ────────────────────────────────
router.get('/:id', anyRole, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const run = await findRun(req.params.id);
    if (!run) return notFound(res, 'Payment run not found');
    success(res, run);
  } catch (err) { next(err); }
});

// ── GET /api/payment-runs/:id/lines ─────────────────────────
router.get('/:id/lines', anyRole, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const page   = parseInt(req.query.page  as string) || 1;
    const limit  = parseInt(req.query.limit as string) || 50;
    const offset = (page - 1) * limit;

    const countRes = await query(
      `SELECT COUNT(*) FROM nps.pension_payment_lines WHERE run_id = $1`, [req.params.id]
    );
    const total = parseInt(countRes.rows[0].count);

    const dataRes = await query(
      `SELECT ppl.id, ppl.gross_amount, ppl.tax_deduction, ppl.other_deductions,
              ppl.total_deductions, ppl.net_amount, ppl.status,
              p.id AS pensioner_id, p.pension_no, p.employee_no,
              CONCAT(COALESCE(p.title||' ',''), p.first_name, ' ', p.last_name) AS pensioner_name,
              p.designation_at_retirement, p.department_text AS department_name,
              ba.bank_name, ba.branch_name,
              CASE WHEN ba.account_number IS NOT NULL
                   THEN CONCAT('****', RIGHT(ba.account_number,4))
                   ELSE '—' END AS account_masked
       FROM nps.pension_payment_lines ppl
       JOIN nps.pensioners p ON ppl.pensioner_id = p.id
       LEFT JOIN nps.bank_accounts ba ON ppl.bank_account_id = ba.id
       WHERE ppl.run_id = $1
       ORDER BY p.last_name, p.first_name
       LIMIT $2 OFFSET $3`,
      [req.params.id, limit, offset]
    );
    paginated(res, dataRes.rows, total, page, limit);
  } catch (err) { next(err); }
});

// ── WORKFLOW ACTIONS ─────────────────────────────────────────
// POST /api/payment-runs/:id/submit
router.post('/:id/submit', creatorOrAdmin, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const run = await findRun(req.params.id);
    if (!run) return notFound(res, 'Payment run not found');
    if (run.status !== 'pending') return badRequest(res, 'Run must be in pending status to submit');
    await query(
      `UPDATE nps.pension_payment_runs
       SET status='submitted', submitted_by=$1, submitted_at=NOW(), updated_at=NOW()
       WHERE id=$2`,
      [req.user!.userId, req.params.id]
    );
    await query(
      `INSERT INTO nps.workflow_audit_trail
         (entity_type,entity_id,action,action_by,previous_status,new_status,remarks,ip_address)
       VALUES ('payment_run',$1,'submitted',$2,'pending','submitted',$3,$4::inet)`,
      [req.params.id, req.user!.userId, req.body.remarks||'', req.ip||'127.0.0.1']
    );
    success(res, await findRun(req.params.id), 'Payment run submitted for approval');
  } catch (err) { next(err); }
});

// POST /api/payment-runs/:id/approve-1
router.post('/:id/approve-1', approver1OrAdmin, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const run = await findRun(req.params.id);
    if (!run) return notFound(res, 'Payment run not found');
    if (run.status !== 'submitted') return badRequest(res, 'Run must be in submitted status');
    if (run.created_by === req.user!.userId || run.submitted_by === req.user!.userId)
      return forbidden(res, 'Cannot approve a run you created or submitted');
    await query(
      `UPDATE nps.pension_payment_runs
       SET status='approved_1', approved_by_1=$1, approved_at_1=NOW(), updated_at=NOW()
       WHERE id=$2`,
      [req.user!.userId, req.params.id]
    );
    await query(
      `INSERT INTO nps.workflow_audit_trail
         (entity_type,entity_id,action,action_by,previous_status,new_status,remarks,ip_address)
       VALUES ('payment_run',$1,'approved_1',$2,'submitted','approved_1',$3,$4::inet)`,
      [req.params.id, req.user!.userId, req.body.remarks||'', req.ip||'127.0.0.1']
    );
    success(res, await findRun(req.params.id), 'Payment run approved (Level 1)');
  } catch (err) { next(err); }
});

// POST /api/payment-runs/:id/approve-2
router.post('/:id/approve-2', approver2OrAdmin, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const run = await findRun(req.params.id);
    if (!run) return notFound(res, 'Payment run not found');
    if (run.status !== 'approved_1') return badRequest(res, 'Run must be approved by Level 1 first');
    if (run.created_by === req.user!.userId || run.submitted_by === req.user!.userId)
      return forbidden(res, 'Cannot approve a run you created or submitted');
    await query(
      `UPDATE nps.pension_payment_runs
       SET status='processed', approved_by_2=$1, approved_at_2=NOW(), processed_at=NOW(), updated_at=NOW()
       WHERE id=$2`,
      [req.user!.userId, req.params.id]
    );
    // Mark all lines as paid
    await query(
      `UPDATE nps.pension_payment_lines SET status='paid' WHERE run_id=$1`,
      [req.params.id]
    );
    await query(
      `INSERT INTO nps.workflow_audit_trail
         (entity_type,entity_id,action,action_by,previous_status,new_status,remarks,ip_address)
       VALUES ('payment_run',$1,'approved_2',$2,'approved_1','processed',$3,$4::inet)`,
      [req.params.id, req.user!.userId, req.body.remarks||'', req.ip||'127.0.0.1']
    );
    success(res, await findRun(req.params.id), 'Payment run approved and processed');
  } catch (err) { next(err); }
});

// POST /api/payment-runs/:id/reject
router.post('/:id/reject', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const run = await findRun(req.params.id);
    if (!run) return notFound(res, 'Payment run not found');
    if (!req.body.remarks) return badRequest(res, 'Remarks required when rejecting');
    await query(
      `UPDATE nps.pension_payment_runs SET status='pending', updated_at=NOW() WHERE id=$1`,
      [req.params.id]
    );
    await query(
      `INSERT INTO nps.workflow_audit_trail
         (entity_type,entity_id,action,action_by,previous_status,new_status,remarks,ip_address)
       VALUES ('payment_run',$1,'rejected',$2,$3,'pending',$4,$5::inet)`,
      [req.params.id, req.user!.userId, run.status, req.body.remarks, req.ip||'127.0.0.1']
    );
    success(res, null, 'Payment run rejected and returned to pending');
  } catch (err) { next(err); }
});

// POST /api/payment-runs/:id/reverse
router.post('/:id/reverse', adminOnly, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const run = await findRun(req.params.id);
    if (!run) return notFound(res, 'Payment run not found');
    if (run.status !== 'processed') return badRequest(res, 'Only processed runs can be reversed');
    if (!req.body.remarks) return badRequest(res, 'Reason for reversal is required');
    await query(
      `UPDATE nps.pension_payment_runs SET status='reversed', updated_at=NOW() WHERE id=$1`,
      [req.params.id]
    );
    await query(
      `INSERT INTO nps.workflow_audit_trail
         (entity_type,entity_id,action,action_by,previous_status,new_status,remarks,ip_address)
       VALUES ('payment_run',$1,'reversed',$2,'processed','reversed',$3,$4::inet)`,
      [req.params.id, req.user!.userId, req.body.remarks, req.ip||'127.0.0.1']
    );
    success(res, null, 'Payment run reversed');
  } catch (err) { next(err); }
});

export default router;

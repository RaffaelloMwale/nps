import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { query } from '../../config/database';
import { authenticate, AuthRequest } from '../../middlewares/auth.middleware';
import { creatorOrAdmin, anyRole, approver1OrAdmin, approver2OrAdmin } from '../../middlewares/rbac.middleware';
import { success, created, paginated, notFound, badRequest } from '../../utils/responseHelper';

const router = Router();
router.use(authenticate);

// Arrear types
// pension_gap     = months between retirement and pension start where no payments were made
// underpayment    = was paid less than entitled amount for a period
// gratuity_balance= outstanding gratuity owed
// salary_arrear   = salary owed before retirement
// other

const CreateArrearSchema = z.object({
  pensionerId:     z.string().uuid(),
  arrearType:      z.enum(['pension_gap','underpayment','gratuity_balance','salary_arrear','other']),
  description:     z.string().min(1),
  fromPeriod:      z.string().optional(),   // YYYY-MM
  toPeriod:        z.string().optional(),   // YYYY-MM
  numberOfMonths:  z.number().optional(),   // for pension_gap / underpayment
  monthlyAmount:   z.number().optional(),   // monthly pension amount owed per month (for gap)
  computedAmount:  z.number().positive(),   // total amount owed
  bankAccountId:   z.string().uuid().optional(),
  notes:           z.string().optional(),
});

function arrearRef() {
  return `ARR-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`;
}

// GET /api/arrears
router.get('/', anyRole, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const page   = parseInt(req.query.page  as string || '1');
    const limit  = parseInt(req.query.limit as string || '20');
    const offset = (page - 1) * limit;

    const conditions = ['1=1'];
    const params: unknown[] = [];
    let i = 1;

    if (req.query.status)      { conditions.push(`a.status=$${i++}`);      params.push(req.query.status); }
    if (req.query.arrearType)  { conditions.push(`a.arrear_type=$${i++}`); params.push(req.query.arrearType); }
    if (req.query.pensionerId) { conditions.push(`a.pensioner_id=$${i++}`);params.push(req.query.pensionerId); }

    const where = conditions.join(' AND ');
    const countRes = await query(`SELECT COUNT(*) FROM nps.arrears a WHERE ${where}`, params);
    const total = parseInt(countRes.rows[0].count);

    params.push(limit, offset);
    const dataRes = await query(
      `SELECT a.*,
              CONCAT(p.first_name,' ',p.last_name) AS pensioner_name,
              p.pension_no,
              p.monthly_pension,
              p.pension_start_date,
              p.date_of_retirement,
              u1.full_name AS created_by_name,
              u2.full_name AS approved_by_name,
              u3.full_name AS paid_by_name
       FROM nps.arrears a
       JOIN nps.pensioners p ON a.pensioner_id=p.id
       LEFT JOIN nps.system_users u1 ON a.created_by=u1.id
       LEFT JOIN nps.system_users u2 ON a.approved_by=u2.id
       LEFT JOIN nps.system_users u3 ON a.paid_by=u3.id
       WHERE ${where}
       ORDER BY a.created_at DESC
       LIMIT $${i} OFFSET $${i+1}`,
      params
    );
    paginated(res, dataRes.rows, total, page, limit);
  } catch (err) { next(err); }
});

// POST /api/arrears
router.post('/', creatorOrAdmin, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = CreateArrearSchema.parse(req.body);

    // If pension_gap, auto-calculate if months and monthly amount given
    let computedAmount = data.computedAmount;
    let description = data.description;

    if (data.arrearType === 'pension_gap' && data.numberOfMonths && data.monthlyAmount) {
      computedAmount = data.numberOfMonths * data.monthlyAmount;
      description = data.description || `Pension gap: ${data.numberOfMonths} months × K${data.monthlyAmount.toLocaleString()} (${data.fromPeriod || ''} to ${data.toPeriod || ''})`;
    }

    const res2 = await query(
      `INSERT INTO nps.arrears
         (arrear_ref, pensioner_id, arrear_type, description,
          from_period, to_period, computed_amount, bank_account_id,
          status, created_by, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending',$9,$10)
       RETURNING *`,
      [arrearRef(), data.pensionerId, data.arrearType, description,
       data.fromPeriod||null, data.toPeriod||null, computedAmount,
       data.bankAccountId||null, req.user!.userId, data.notes||null]
    );
    created(res, res2.rows[0], 'Arrear record created');
  } catch (err) { next(err); }
});

// GET /api/arrears/:id
router.get('/:id', anyRole, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const res2 = await query(
      `SELECT a.*,
              CONCAT(p.first_name,' ',p.last_name) AS pensioner_name,
              p.pension_no, p.monthly_pension, p.pension_start_date, p.date_of_retirement,
              u1.full_name AS created_by_name,
              u2.full_name AS approved_by_name
       FROM nps.arrears a
       JOIN nps.pensioners p ON a.pensioner_id=p.id
       LEFT JOIN nps.system_users u1 ON a.created_by=u1.id
       LEFT JOIN nps.system_users u2 ON a.approved_by=u2.id
       WHERE a.id=$1`, [req.params.id]
    );
    if (!res2.rows[0]) return notFound(res, 'Arrear not found');
    success(res, res2.rows[0]);
  } catch (err) { next(err); }
});


// POST /api/arrears/:id/submit
router.post('/:id/submit', creatorOrAdmin, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const res2 = await query(`SELECT * FROM nps.arrears WHERE id=$1`, [req.params.id]);
    if (!res2.rows[0]) return notFound(res, 'Arrear not found');
    if (res2.rows[0].status !== 'pending') return badRequest(res, 'Arrear must be pending to submit');
    // Arrears go straight to pending→approved flow (no separate submit step in schema)
    // Submitting just confirms the record and makes it ready for approval
    success(res, res2.rows[0], 'Arrear submitted for approval');
  } catch (err) { next(err); }
});

// POST /api/arrears/:id/approve
router.post('/:id/approve', approver1OrAdmin, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const res2 = await query(`SELECT * FROM nps.arrears WHERE id=$1`, [req.params.id]);
    if (!res2.rows[0]) return notFound(res, 'Arrear not found');
    if (res2.rows[0].status !== 'pending') return badRequest(res, 'Arrear must be pending to approve');
    await query(
      `UPDATE nps.arrears SET status='approved', approved_by=$1, approved_at=NOW() WHERE id=$2`,
      [req.user!.userId, req.params.id]
    );
    success(res, null, 'Arrear approved');
  } catch (err) { next(err); }
});

// POST /api/arrears/:id/pay
router.post('/:id/pay', approver2OrAdmin, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const res2 = await query(`SELECT * FROM nps.arrears WHERE id=$1`, [req.params.id]);
    if (!res2.rows[0]) return notFound(res, 'Arrear not found');
    if (res2.rows[0].status !== 'approved') return badRequest(res, 'Arrear must be approved first');
    await query(
      `UPDATE nps.arrears SET status='paid', paid_by=$1, paid_at=NOW(),
       paid_amount=computed_amount, payment_date=NOW(),
       payment_ref=$2, transaction_ref=$3 WHERE id=$4`,
      [req.user!.userId, req.body.paymentRef||null, req.body.transactionRef||null, req.params.id]
    );
    success(res, null, 'Arrear payment recorded');
  } catch (err) { next(err); }
});

// POST /api/arrears/:id/cancel
router.post('/:id/cancel', creatorOrAdmin, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.body.reason) return badRequest(res, 'Cancellation reason is required');
    await query(
      `UPDATE nps.arrears SET status='cancelled', notes=CONCAT(COALESCE(notes,''),' | CANCELLED: ',$1) WHERE id=$2`,
      [req.body.reason, req.params.id]
    );
    success(res, null, 'Arrear cancelled');
  } catch (err) { next(err); }
});

// GET /api/arrears/pensioner/:pensionerId/gap-check
// Helper: computes the pension gap for a pensioner automatically
router.get('/pensioner/:pensionerId/gap-check', anyRole, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const res2 = await query(
      `SELECT p.pension_no, p.first_name, p.last_name,
              p.date_of_retirement, p.pension_start_date, p.monthly_pension,
              -- How many months between retirement and pension start?
              CASE
                WHEN p.pension_start_date IS NOT NULL AND p.date_of_retirement IS NOT NULL
                THEN EXTRACT(YEAR FROM AGE(p.pension_start_date::date, p.date_of_retirement::date))*12 +
                     EXTRACT(MONTH FROM AGE(p.pension_start_date::date, p.date_of_retirement::date))
                ELSE NULL
              END AS gap_months,
              CASE
                WHEN p.pension_start_date IS NOT NULL AND p.date_of_retirement IS NOT NULL
                THEN p.monthly_pension * (
                       EXTRACT(YEAR FROM AGE(p.pension_start_date::date, p.date_of_retirement::date))*12 +
                       EXTRACT(MONTH FROM AGE(p.pension_start_date::date, p.date_of_retirement::date))
                     )
                ELSE 0
              END AS gap_amount
       FROM nps.pensioners p WHERE p.id=$1`, [req.params.pensionerId]
    );
    if (!res2.rows[0]) return notFound(res, 'Pensioner not found');
    success(res, res2.rows[0]);
  } catch (err) { next(err); }
});

export default router;

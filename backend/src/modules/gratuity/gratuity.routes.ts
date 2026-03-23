import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { query } from '../../config/database';
import { authenticate, AuthRequest } from '../../middlewares/auth.middleware';
import { creatorOrAdmin, anyRole, approver1OrAdmin, approver2OrAdmin } from '../../middlewares/rbac.middleware';
import { success, created, paginated, notFound, badRequest, forbidden } from '../../utils/responseHelper';

const router = Router();
router.use(authenticate);

const CreateGratuitySchema = z.object({
  pensionerId:         z.string().uuid(),
  gratuityType:        z.enum(['full', 'partial', 'death']),
  claimDate:           z.string(),
  amountRequested:     z.number().positive('Amount must be positive'),
  isPartial:           z.boolean().default(false),
  partialReason:       z.string().optional(),
  bankAccountId:       z.string().uuid().optional(),
  beneficiaryName:     z.string().optional(),
  beneficiaryRelation: z.string().optional(),
  beneficiaryIdNo:     z.string().optional(),
  beneficiaryPhone:    z.string().optional(),
  notes:               z.string().optional(),
});

function gratuityRef() {
  return `GR-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`;
}

// ── GET /api/gratuity ─────────────────────────────────────────
router.get('/', anyRole, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const page   = parseInt(req.query.page  as string || '1');
    const limit  = parseInt(req.query.limit as string || '20');
    const offset = (page - 1) * limit;

    const conditions = ['1=1'];
    const params: unknown[] = [];
    let i = 1;
    if (req.query.status)      { conditions.push(`gr.status=$${i++}`);        params.push(req.query.status); }
    if (req.query.gratuityType){ conditions.push(`gr.gratuity_type=$${i++}`); params.push(req.query.gratuityType); }
    if (req.query.pensionerId) { conditions.push(`gr.pensioner_id=$${i++}`);  params.push(req.query.pensionerId); }
    if (req.query.received === 'true')  { conditions.push(`gr.gratuity_received=TRUE`); }
    if (req.query.received === 'false') { conditions.push(`gr.gratuity_received=FALSE`); }

    const where = conditions.join(' AND ');
    const countRes = await query(`SELECT COUNT(*) FROM nps.gratuity_records gr WHERE ${where}`, params);
    const total = parseInt(countRes.rows[0].count);

    params.push(limit, offset);
    const dataRes = await query(
      `SELECT gr.*,
              CONCAT(p.first_name,' ',p.last_name) AS pensioner_name,
              p.pension_no, p.pre_retirement_gratuity_paid,
              u1.full_name AS created_by_name,
              u2.full_name AS approved_by_1_name,
              u3.full_name AS approved_by_2_name
       FROM nps.gratuity_records gr
       JOIN nps.pensioners p ON gr.pensioner_id = p.id
       LEFT JOIN nps.system_users u1 ON gr.created_by   = u1.id
       LEFT JOIN nps.system_users u2 ON gr.approved_by_1 = u2.id
       LEFT JOIN nps.system_users u3 ON gr.approved_by_2 = u3.id
       WHERE ${where}
       ORDER BY gr.created_at DESC
       LIMIT $${i} OFFSET $${i+1}`,
      params
    );
    paginated(res, dataRes.rows, total, page, limit);
  } catch (err) { next(err); }
});

// ── POST /api/gratuity ────────────────────────────────────────
router.post('/', creatorOrAdmin, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = CreateGratuitySchema.parse(req.body);

    // Get balance — includes pre-retirement partial deduction
    const balRes = await query(
      `SELECT total_gratuity_due, total_gratuity_paid,
              gratuity_balance_remaining, pre_retirement_gratuity_paid
       FROM nps.v_gratuity_balance WHERE pensioner_id=$1`,
      [data.pensionerId]
    );
    const bal = balRes.rows[0];
    if (!bal) return notFound(res, 'Pensioner not found');

    const balance = parseFloat(bal.gratuity_balance_remaining);
    if (balance <= 0) {
      return badRequest(res, 'This pensioner has no remaining gratuity balance');
    }
    if (data.amountRequested > balance) {
      return badRequest(res,
        `Amount requested (${data.amountRequested.toLocaleString()}) exceeds remaining balance (${balance.toLocaleString()})`
      );
    }

    const isPartial = data.isPartial || data.amountRequested < balance;

    const insertRes = await query(
      `INSERT INTO nps.gratuity_records
         (gratuity_ref, pensioner_id, gratuity_type, claim_date,
          total_gratuity_due_snapshot, amount_requested, is_partial, partial_reason,
          bank_account_id, beneficiary_name, beneficiary_relation, beneficiary_id_no,
          beneficiary_phone, status, created_by, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'pending',$14,$15)
       RETURNING *`,
      [
        gratuityRef(), data.pensionerId, data.gratuityType, data.claimDate,
        bal.total_gratuity_due, data.amountRequested, isPartial, data.partialReason||null,
        data.bankAccountId||null, data.beneficiaryName||null, data.beneficiaryRelation||null,
        data.beneficiaryIdNo||null, data.beneficiaryPhone||null,
        req.user!.userId, data.notes||null,
      ]
    );
    created(res, insertRes.rows[0], 'Gratuity claim created');
  } catch (err) { next(err); }
});


// ── POST /api/gratuity/direct-pay ────────────────────────────
// Creates a gratuity record and marks it as paid in a single step.
// Used by the "Pay Gratuity" form. Requires admin or creator role.
// The payment is recorded as authorised by the submitting user.
router.post('/direct-pay', creatorOrAdmin, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const {
      pensionerId, paymentType, paymentDate, amountPaid,
      ifmisTrfNumber, partialReason,
      beneficiaryName, beneficiaryRelation, beneficiaryIdNo, beneficiaryPhone,
      notes,
    } = req.body;

    if (!pensionerId)  throw new Error('pensionerId is required');
    if (!amountPaid || amountPaid <= 0) throw new Error('amountPaid must be positive');

    // Check balance
    const balRes = await query(
      `SELECT total_gratuity_due, total_gratuity_paid, gratuity_balance_remaining,
              pre_retirement_gratuity_paid
       FROM nps.v_gratuity_balance WHERE pensioner_id=$1`,
      [pensionerId]
    );
    const bal = balRes.rows[0];
    if (!bal) return notFound(res, 'Pensioner not found');

    const balance = parseFloat(bal.gratuity_balance_remaining);
    if (balance <= 0)         return badRequest(res, 'No remaining gratuity balance for this pensioner');
    if (amountPaid > balance) return badRequest(res,
      `Amount (${Number(amountPaid).toLocaleString()}) exceeds remaining balance (${balance.toLocaleString()})`
    );

    const isPartial        = paymentType === 'partial' || amountPaid < balance;
    const ref              = gratuityRef();
    const userId           = req.user!.userId;
    const ifmisTrf         = ifmisTrfNumber || null;
    const gratuityReceived = !!(ifmisTrf && ifmisTrf !== '');

    // Insert directly as 'paid' — each param has exactly one type, no CASE on params
    const insertRes = await query(
      `INSERT INTO nps.gratuity_records
         (gratuity_ref, pensioner_id, gratuity_type, claim_date,
          total_gratuity_due_snapshot, amount_requested,
          is_partial, partial_reason,
          beneficiary_name, beneficiary_relation, beneficiary_id_no, beneficiary_phone,
          status,
          created_by, submitted_by, approved_by_1, approved_by_2, paid_by,
          created_at, submitted_at, approved_at_1, approved_at_2, paid_at, payment_date,
          ifmis_trf_number,
          gratuity_received,
          payment_ref,
          notes)
       VALUES
         ($1, $2, $3, $4,
          $5, $6,
          $7, $8,
          $9, $10, $11, $12,
          'paid',
          $13, $13, $13, $13, $13,
          NOW(), NOW(), NOW(), NOW(), NOW(), $4::date,
          $14,
          $15,
          $14,
          $16)
       RETURNING *`,
      [
        ref,                                                  // $1
        pensionerId,                                          // $2
        paymentType || 'full',                                // $3
        paymentDate || new Date().toISOString().slice(0, 10), // $4
        bal.total_gratuity_due,                               // $5
        amountPaid,                                           // $6
        isPartial,                                            // $7
        partialReason || null,                                // $8
        beneficiaryName     || null,                          // $9
        beneficiaryRelation || null,                          // $10
        beneficiaryIdNo     || null,                          // $11
        beneficiaryPhone    || null,                          // $12
        userId,                                               // $13
        ifmisTrf,                                             // $14  text
        gratuityReceived,                                     // $15  boolean
        notes || null,                                        // $16
      ]
    );

    // Audit trail
    await query(
      `INSERT INTO nps.workflow_audit_trail
         (entity_type, entity_id, action, action_by, previous_status, new_status, remarks, ip_address)
       VALUES ('gratuity',$1,'paid',$2,'pending','paid',$3,$4::inet)`,
      [
        insertRes.rows[0].id,
        userId,
        ifmisTrfNumber
          ? `Direct pay — IFMIS TRF: ${ifmisTrfNumber} — Amount: ${amountPaid}`
          : `Direct pay — Amount: ${amountPaid}`,
        req.ip || '127.0.0.1',
      ]
    );

    created(res, insertRes.rows[0],
      `Gratuity payment of ${Number(amountPaid).toLocaleString()} recorded successfully${ifmisTrfNumber ? ` — IFMIS TRF: ${ifmisTrfNumber}` : ''}`
    );
  } catch (err) { next(err); }
});

// ── GET /api/gratuity/:id ─────────────────────────────────────
router.get('/:id', anyRole, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const res2 = await query(
      `SELECT gr.*,
              CONCAT(p.first_name,' ',p.last_name) AS pensioner_name,
              p.pension_no, p.pre_retirement_gratuity_paid,
              u1.full_name AS created_by_name,
              u2.full_name AS approved_by_1_name,
              u3.full_name AS approved_by_2_name,
              u4.full_name AS paid_by_name
       FROM nps.gratuity_records gr
       JOIN nps.pensioners p ON gr.pensioner_id = p.id
       LEFT JOIN nps.system_users u1 ON gr.created_by   = u1.id
       LEFT JOIN nps.system_users u2 ON gr.approved_by_1 = u2.id
       LEFT JOIN nps.system_users u3 ON gr.approved_by_2 = u3.id
       LEFT JOIN nps.system_users u4 ON gr.paid_by       = u4.id
       WHERE gr.id=$1`, [req.params.id]
    );
    if (!res2.rows[0]) return notFound(res, 'Gratuity record not found');
    success(res, res2.rows[0]);
  } catch (err) { next(err); }
});

// ── Shared workflow helper ────────────────────────────────────
async function gratuityWorkflow(
  req: AuthRequest, res: Response, next: NextFunction,
  requiredStatus: string, newStatus: string,
  updateSql: string, updateParams: unknown[]
) {
  try {
    const existing = await query(`SELECT * FROM nps.gratuity_records WHERE id=$1`, [req.params.id]);
    const rec = existing.rows[0];
    if (!rec) return notFound(res, 'Gratuity record not found');
    if (rec.status !== requiredStatus)
      return badRequest(res, `Record must be in '${requiredStatus}' status`);
    if (newStatus !== 'pending' && rec.created_by === req.user!.userId)
      return forbidden(res, 'Cannot approve your own submission');

    await query(updateSql, updateParams);
    await query(
      `INSERT INTO nps.workflow_audit_trail
         (entity_type,entity_id,action,action_by,previous_status,new_status,remarks,ip_address)
       VALUES ('gratuity',$1,$2,$3,$4,$5,$6,$7::inet)`,
      [req.params.id, newStatus, req.user!.userId,
       requiredStatus, newStatus, req.body.remarks||'', req.ip||'127.0.0.1']
    );
    success(res, null, `Gratuity ${newStatus.replace('_',' ')}`);
  } catch (err) { next(err); }
}

// POST /api/gratuity/:id/submit
router.post('/:id/submit', creatorOrAdmin, (req: AuthRequest, res: Response, next: NextFunction) =>
  gratuityWorkflow(req, res, next, 'pending', 'submitted',
    `UPDATE nps.gratuity_records SET status='submitted', submitted_by=$1, submitted_at=NOW() WHERE id=$2`,
    [req.user!.userId, req.params.id]
  )
);

// POST /api/gratuity/:id/approve-1
router.post('/:id/approve-1', approver1OrAdmin, (req: AuthRequest, res: Response, next: NextFunction) =>
  gratuityWorkflow(req, res, next, 'submitted', 'approved_1',
    `UPDATE nps.gratuity_records SET status='approved_1', approved_by_1=$1, approved_at_1=NOW() WHERE id=$2`,
    [req.user!.userId, req.params.id]
  )
);

// POST /api/gratuity/:id/approve-2
router.post('/:id/approve-2', approver2OrAdmin, (req: AuthRequest, res: Response, next: NextFunction) =>
  gratuityWorkflow(req, res, next, 'approved_1', 'approved_2',
    `UPDATE nps.gratuity_records SET status='approved_2', approved_by_2=$1, approved_at_2=NOW() WHERE id=$2`,
    [req.user!.userId, req.params.id]
  )
);

// POST /api/gratuity/:id/pay
// Records the payment AND optionally the IFMIS TRF number
router.post('/:id/pay', approver2OrAdmin, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const rec = (await query(`SELECT * FROM nps.gratuity_records WHERE id=$1`, [req.params.id])).rows[0];
    if (!rec) return notFound(res, 'Gratuity record not found');
    if (rec.status !== 'approved_2') return badRequest(res, 'Must be fully approved before paying');

    const { paymentRef, transactionRef, ifmisTrfNumber } = req.body;

    await query(
      `UPDATE nps.gratuity_records SET
         status          = 'paid',
         paid_by         = $1,
         paid_at         = NOW(),
         payment_date    = NOW(),
         payment_ref     = $2,
         transaction_ref = $3,
         ifmis_trf_number = $4,
         gratuity_received = CASE WHEN $4 IS NOT NULL THEN TRUE ELSE FALSE END
       WHERE id = $5`,
      [req.user!.userId, paymentRef||null, transactionRef||null, ifmisTrfNumber||null, req.params.id]
    );
    await query(
      `INSERT INTO nps.workflow_audit_trail
         (entity_type,entity_id,action,action_by,previous_status,new_status,remarks,ip_address)
       VALUES ('gratuity',$1,'paid',$2,'approved_2','paid',$3,$4::inet)`,
      [req.params.id, req.user!.userId,
       ifmisTrfNumber ? `IFMIS TRF: ${ifmisTrfNumber}` : (paymentRef || ''),
       req.ip||'127.0.0.1']
    );
    success(res, null, 'Gratuity payment recorded');
  } catch (err) { next(err); }
});

// ── POST /api/gratuity/:id/mark-received ─────────────────────
// Allows any authorised user to mark a PAID gratuity as received
// by the pensioner/beneficiary, with an optional IFMIS TRF number.
router.post('/:id/mark-received', anyRole, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const rec = (await query(`SELECT * FROM nps.gratuity_records WHERE id=$1`, [req.params.id])).rows[0];
    if (!rec) return notFound(res, 'Gratuity record not found');
    if (rec.status !== 'paid') return badRequest(res, 'Can only mark a paid gratuity as received');

    const { ifmisTrfNumber, received } = req.body;
    const isReceived = received !== false; // default true

    await query(
      `UPDATE nps.gratuity_records SET
         gratuity_received = $1,
         ifmis_trf_number  = COALESCE($2, ifmis_trf_number)
       WHERE id = $3`,
      [isReceived, ifmisTrfNumber||null, req.params.id]
    );

    await query(
      `INSERT INTO nps.workflow_audit_trail
         (entity_type,entity_id,action,action_by,previous_status,new_status,remarks,ip_address)
       VALUES ('gratuity',$1,'paid',$2,'paid','paid',$3,$4::inet)`,
      [req.params.id, req.user!.userId,
       isReceived
         ? `Marked as received${ifmisTrfNumber ? ` — IFMIS TRF: ${ifmisTrfNumber}` : ''}`
         : 'Marked as NOT received',
       req.ip||'127.0.0.1']
    );

    success(res, null,
      isReceived
        ? `Gratuity marked as received${ifmisTrfNumber ? ` (IFMIS TRF: ${ifmisTrfNumber})` : ''}`
        : 'Gratuity marked as not yet received'
    );
  } catch (err) { next(err); }
});

// POST /api/gratuity/:id/reject
router.post('/:id/reject', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.body.remarks) return badRequest(res, 'Rejection reason is required');
    const rec = (await query(`SELECT status FROM nps.gratuity_records WHERE id=$1`, [req.params.id])).rows[0];
    if (!rec) return notFound(res, 'Gratuity record not found');
    await query(
      `UPDATE nps.gratuity_records SET status='rejected', rejection_reason=$1 WHERE id=$2`,
      [req.body.remarks, req.params.id]
    );
    success(res, null, 'Gratuity claim rejected');
  } catch (err) { next(err); }
});

export default router;

import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { query } from '../../config/database';
import { authenticate, AuthRequest } from '../../middlewares/auth.middleware';
import { creatorOrAdmin, anyRole } from '../../middlewares/rbac.middleware';
import { success, created, paginated, notFound, badRequest } from '../../utils/responseHelper';

const router = Router();
router.use(authenticate);

// ── SCHEMA ───────────────────────────────────────────────────
const PensionerSchema = z.object({
  pensionNo:                    z.string().min(1).optional(),
  employeeNo:                   z.string().min(1),
  title:                        z.string().optional(),
  firstName:                    z.string().min(1),
  middleName:                   z.string().optional(),
  lastName:                     z.string().min(1),
  gender:                       z.enum(['male','female','other']),
  dateOfBirth:                  z.string().min(1),
  nationalId:                   z.string().optional(),
  passportNo:                   z.string().optional(),
  maritalStatus:                z.string().optional(),
  phonePrimary:                 z.string().optional(),
  phoneSecondary:               z.string().optional(),
  email:                        z.string().email().optional().or(z.literal('')),
  postalAddress:                z.string().optional(),
  physicalAddress:              z.string().optional(),
  nextOfKinName:                z.string().optional(),
  nextOfKinRelation:            z.string().optional(),
  nextOfKinPhone:               z.string().optional(),
  nextOfKinAddress:             z.string().optional(),
  departmentText:               z.string().optional(),  // free-text department name — no FK
  // designationId removed — designation entered as free text via designationAtRetirement
  // Employment record fields
  designationAtRetirement:      z.string().optional(),   // free-text label
  gradeAtRetirement:            z.string().optional(),
  gradeAtFirstAppointment:      z.string().optional(),
  employmentType:               z.enum(['permanent','contract','casual']).default('permanent'),
  dateOfFirstAppointment:       z.string().min(1),
  dateOfRetirement:             z.string().optional(),
  dateOfDeath:                  z.string().optional(),
  yearsOfService:               z.number().optional().nullable(),
  reasonForExit:                z.string().optional(),
  deceasedOnEntry:              z.boolean().optional().default(false),
  // Core financial fields
  monthlyPension:               z.number().min(0),
  // Pre-retirement partial gratuity — paid before entering the system
  // System deducts this from total_gratuity_due to give the net balance
  preRetirementGratuityPaid:    z.number().min(0).default(0),
  preRetirementGratuityReason:  z.string().optional(),
  totalGratuityDue:             z.number().min(0).default(0),
  pensionStartDate:             z.string().optional(),
  notes:                        z.string().optional(),
});

// ── HELPERS ──────────────────────────────────────────────────
async function findById(id: string) {
  const res = await query(
    `SELECT p.*,
            su.full_name AS introduced_by_name,
            EXTRACT(YEAR FROM AGE(p.date_of_birth))::int AS age
     FROM nps.pensioners p
     LEFT JOIN nps.system_users su ON p.introduced_by = su.id
     WHERE p.id = $1`, [id]
  );
  return res.rows[0] || null;
}

// ── GET /api/pensioners ──────────────────────────────────────
router.get('/', anyRole, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const page   = parseInt(req.query.page  as string || '1');
    const limit  = parseInt(req.query.limit as string || '20');
    const offset = (page - 1) * limit;

    const conditions: string[] = ['1=1'];
    const params: unknown[] = [];
    let i = 1;

    if (req.query.status) { conditions.push(`p.status = $${i++}`); params.push(req.query.status); }
    if (req.query.search) {
      conditions.push(`(p.first_name ILIKE $${i} OR p.last_name ILIKE $${i} OR p.pension_no ILIKE $${i} OR p.employee_no ILIKE $${i})`);
      params.push(`%${req.query.search}%`); i++;
    }
    if (req.query.departmentId) { conditions.push(`p.department_id = $${i++}`); params.push(req.query.departmentId); }
    if (req.query.deceased === 'true') { conditions.push(`p.status = 'deceased'`); }
    if (req.query.deceasedOnEntry === 'true') { conditions.push(`p.deceased_on_entry = TRUE`); }

    const where = conditions.join(' AND ');
    const countRes = await query(`SELECT COUNT(*) FROM nps.pensioners p WHERE ${where}`, params);
    const total = parseInt(countRes.rows[0].count);

    params.push(limit, offset);
    const dataRes = await query(
      `SELECT p.id, p.pension_no, p.employee_no, p.title, p.first_name, p.middle_name, p.last_name,
              p.gender, p.date_of_birth, EXTRACT(YEAR FROM AGE(p.date_of_birth))::int AS age,
              p.national_id, p.phone_primary, p.email, p.status,
              p.monthly_pension, p.total_gratuity_due, p.pension_start_date,
              p.date_of_retirement, p.date_of_death, p.years_of_service,
              p.designation_at_retirement, p.grade_at_retirement,
              p.grade_at_first_appointment, p.deceased_on_entry,
              p.department_text, p.created_at,
              su.full_name AS introduced_by_name
       FROM nps.pensioners p
       LEFT JOIN nps.system_users su ON p.introduced_by = su.id
       WHERE ${where}
       ORDER BY p.created_at DESC
       LIMIT $${i} OFFSET $${i+1}`,
      params
    );
    paginated(res, dataRes.rows, total, page, limit);
  } catch (err) { next(err); }
});

// ── POST /api/pensioners ─────────────────────────────────────
router.post('/', creatorOrAdmin, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = PensionerSchema.parse(req.body);
    const pensionNo = data.pensionNo || `PEN-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`;

    const dup = await query(`SELECT id FROM nps.pensioners WHERE pension_no = $1`, [pensionNo]);
    if (dup.rows.length > 0) return badRequest(res, `Pension number ${pensionNo} already exists`);

    // designation_at_retirement and grade are free-text — use directly
    const resolvedDesignationName  = data.designationAtRetirement || null;
    const resolvedGradeAtRetirement = data.gradeAtRetirement || null;

    // If deceased_on_entry, status should be deceased
    const status = data.deceasedOnEntry ? 'deceased' : 'active';

    const insertRes = await query(
      `INSERT INTO nps.pensioners
         (pension_no, employee_no, title, first_name, middle_name, last_name,
          gender, date_of_birth, national_id, passport_no, marital_status,
          phone_primary, phone_secondary, email, postal_address, physical_address,
          next_of_kin_name, next_of_kin_relation, next_of_kin_phone, next_of_kin_address,
          department_text,
          designation_at_retirement, grade_at_retirement, grade_at_first_appointment,
          employment_type,
          date_of_first_appointment, date_of_retirement, date_of_death,
          years_of_service, reason_for_exit,
          monthly_pension, total_gratuity_due,
          pre_retirement_gratuity_paid, pre_retirement_gratuity_reason,
          pension_start_date,
          deceased_on_entry, status, introduced_by, notes)
       VALUES
         ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
          $17,$18,$19,$20,
          $21,
          $22,$23,$24,
          $25,
          $26,$27,$28,
          $29,$30,
          $31,$32,$33,
          $34,$35,$36,$37,$38,$39)
       RETURNING *`,
      [
        // $1-$6: identity
        pensionNo, data.employeeNo, data.title||null,
        data.firstName, data.middleName||null, data.lastName,
        // $7-$11: demographics
        data.gender, data.dateOfBirth, data.nationalId||null,
        data.passportNo||null, data.maritalStatus||null,
        // $12-$16: contact
        data.phonePrimary||null, data.phoneSecondary||null,
        data.email||null, data.postalAddress||null, data.physicalAddress||null,
        // $17-$20: next of kin
        data.nextOfKinName||null, data.nextOfKinRelation||null,
        data.nextOfKinPhone||null, data.nextOfKinAddress||null,
        // $21: department as free text (no FK)
        data.departmentText||null,
        // $22-$24: designation fields
        resolvedDesignationName,
        resolvedGradeAtRetirement,
        data.gradeAtFirstAppointment||null,
        // $25: employment type
        data.employmentType,
        // $26-$28: dates
        data.dateOfFirstAppointment, data.dateOfRetirement||null, data.dateOfDeath||null,
        // $29-$30: service info
        data.yearsOfService||null, data.reasonForExit||null,
        // $31-$33: financial
        data.monthlyPension, data.totalGratuityDue,
        data.preRetirementGratuityPaid||0, data.preRetirementGratuityReason||null,
        data.pensionStartDate||null,
        // $34-$37: status and metadata
        data.deceasedOnEntry||false, status, req.user!.userId, data.notes||null,
      ]
    );
    created(res, insertRes.rows[0], 'Pensioner registered successfully');
  } catch (err) { next(err); }
});

// ── GET /api/pensioners/:id ───────────────────────────────────
router.get('/:id', anyRole, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const pensioner = await findById(req.params.id);
    if (!pensioner) return notFound(res, 'Pensioner not found');
    success(res, pensioner);
  } catch (err) { next(err); }
});

// ── PUT /api/pensioners/:id ───────────────────────────────────
router.put('/:id', creatorOrAdmin, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const existing = await findById(req.params.id);
    if (!existing) return notFound(res, 'Pensioner not found');
    const data = PensionerSchema.partial().parse(req.body);

    // designation_at_retirement and grade are entered as free text — no lookup needed
    const resolvedDesignationAtRetirement = data.designationAtRetirement ?? existing.designation_at_retirement;
    const resolvedGradeAtRetirement       = data.gradeAtRetirement       ?? existing.grade_at_retirement;

    const updateRes = await query(
      `UPDATE nps.pensioners SET
         title                      = $1,
         first_name                 = $2,
         middle_name                = $3,
         last_name                  = $4,
         gender                     = $5,
         date_of_birth              = $6,
         national_id                = $7,
         passport_no                = $8,
         marital_status             = $9,
         phone_primary              = $10,
         phone_secondary            = $11,
         email                      = $12,
         postal_address             = $13,
         physical_address           = $14,
         next_of_kin_name           = $15,
         next_of_kin_relation       = $16,
         next_of_kin_phone          = $17,
         next_of_kin_address        = $18,
         department_text            = $19,
         employment_type            = $20,
         designation_at_retirement  = $21,
         grade_at_retirement        = $22,
         grade_at_first_appointment = $23,
         date_of_first_appointment  = $24,
         date_of_retirement         = $25,
         years_of_service           = $26,
         reason_for_exit            = $27,
         monthly_pension            = $28,
         total_gratuity_due                = $29,
         pre_retirement_gratuity_paid  = $30,
         pre_retirement_gratuity_reason = $31,
         pension_start_date             = $32,
         notes                      = $33,
         updated_at                 = NOW()
       WHERE id = $34
       RETURNING *`,
      [
        data.title                       ?? existing.title,
        data.firstName                   ?? existing.first_name,
        data.middleName                  ?? existing.middle_name,
        data.lastName                    ?? existing.last_name,
        data.gender                      ?? existing.gender,
        data.dateOfBirth                 ?? existing.date_of_birth,
        data.nationalId                  ?? existing.national_id,
        data.passportNo                  ?? existing.passport_no,
        data.maritalStatus               ?? existing.marital_status,
        data.phonePrimary                ?? existing.phone_primary,
        data.phoneSecondary              ?? existing.phone_secondary,
        data.email                       ?? existing.email,
        data.postalAddress               ?? existing.postal_address,
        data.physicalAddress             ?? existing.physical_address,
        data.nextOfKinName               ?? existing.next_of_kin_name,
        data.nextOfKinRelation           ?? existing.next_of_kin_relation,
        data.nextOfKinPhone              ?? existing.next_of_kin_phone,
        data.nextOfKinAddress            ?? existing.next_of_kin_address,
        data.departmentText              ?? existing.department_text,
        data.employmentType              ?? existing.employment_type,
        resolvedDesignationAtRetirement,
        resolvedGradeAtRetirement,
        data.gradeAtFirstAppointment     ?? existing.grade_at_first_appointment,
        data.dateOfFirstAppointment      ?? existing.date_of_first_appointment,
        data.dateOfRetirement            ?? existing.date_of_retirement,
        data.yearsOfService              ?? existing.years_of_service,
        data.reasonForExit               ?? existing.reason_for_exit,
        data.monthlyPension              ?? existing.monthly_pension,
        data.totalGratuityDue                ?? existing.total_gratuity_due,
        data.preRetirementGratuityPaid       ?? existing.pre_retirement_gratuity_paid ?? 0,
        data.preRetirementGratuityReason     ?? existing.pre_retirement_gratuity_reason,
        data.pensionStartDate                ?? existing.pension_start_date,
        data.notes                       ?? existing.notes,
        req.params.id,
      ]
    );

    await query(
      `INSERT INTO nps.audit_logs (user_id, action, module, entity_type, entity_id, old_data, new_data, ip_address)
       VALUES ($1,'UPDATE','pensioners','pensioner',$2,$3,$4,$5::inet)`,
      [req.user!.userId, req.params.id,
       JSON.stringify({ monthly_pension: existing.monthly_pension, total_gratuity_due: existing.total_gratuity_due }),
       JSON.stringify({ monthly_pension: data.monthlyPension ?? existing.monthly_pension, total_gratuity_due: data.totalGratuityDue ?? existing.total_gratuity_due }),
       req.ip || '127.0.0.1']
    );
    success(res, updateRes.rows[0], 'Pensioner updated successfully');
  } catch (err) { next(err); }
});

// ── GET /api/pensioners/:id/gratuity-balance ─────────────────
router.get('/:id/gratuity-balance', anyRole, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const res2 = await query(`SELECT * FROM nps.v_gratuity_balance WHERE pensioner_id = $1`, [req.params.id]);
    success(res, res2.rows[0] || null);
  } catch (err) { next(err); }
});

// ── GET /api/pensioners/:id/bank-accounts ────────────────────
router.get('/:id/bank-accounts', anyRole, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const res2 = await query(
      `SELECT * FROM nps.bank_accounts WHERE pensioner_id = $1 AND is_active = TRUE ORDER BY is_primary DESC`,
      [req.params.id]
    );
    success(res, res2.rows);
  } catch (err) { next(err); }
});

// ── POST /api/pensioners/:id/bank-accounts ───────────────────
router.post('/:id/bank-accounts', creatorOrAdmin, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { bankName, branchName, accountNumber, accountName, accountType, effectiveFrom, isPrimary } = req.body;
    if (isPrimary) {
      await query(`UPDATE nps.bank_accounts SET is_primary = FALSE WHERE pensioner_id = $1`, [req.params.id]);
    }
    const res2 = await query(
      `INSERT INTO nps.bank_accounts
         (pensioner_id, bank_name, branch_name, account_number, account_name,
          account_type, is_primary, is_active, effective_from, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE,$8,$9) RETURNING *`,
      [req.params.id, bankName, branchName||null, accountNumber, accountName,
       accountType||'savings', isPrimary||false,
       effectiveFrom||new Date().toISOString().slice(0,10), req.user!.userId]
    );
    created(res, res2.rows[0], 'Bank account added');
  } catch (err) { next(err); }
});

// ── POST /api/pensioners/:id/death ───────────────────────────
router.post('/:id/death', creatorOrAdmin, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { dateOfDeath, notifiedBy, deathCertNo, notes } = req.body;
    if (!dateOfDeath) return badRequest(res, 'Date of death is required');
    const existing = await findById(req.params.id);
    if (!existing) return notFound(res, 'Pensioner not found');
    if (existing.status === 'deceased') return badRequest(res, 'Pensioner is already marked as deceased');

    await query(
      `UPDATE nps.pensioners SET date_of_death=$1, status='deceased', updated_at=NOW() WHERE id=$2`,
      [dateOfDeath, req.params.id]
    );
    await query(
      `INSERT INTO nps.death_notifications
         (pensioner_id, date_of_death, notified_by, notification_date, death_cert_no, recorded_by, notes)
       VALUES ($1,$2,$3,NOW(),$4,$5,$6)`,
      [req.params.id, dateOfDeath, notifiedBy||null, deathCertNo||null, req.user!.userId, notes||null]
    );
    success(res, null, 'Death notification recorded. Pensioner marked as deceased.');
  } catch (err) { next(err); }
});

// ── GET /api/pensioners/deceased (list) ──────────────────────
// Separate route to list all deceased with categories
router.get('/reports/deceased', anyRole, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const page   = parseInt(req.query.page  as string || '1');
    const limit  = parseInt(req.query.limit as string || '50');
    const offset = (page - 1) * limit;

    const countRes = await query(
      `SELECT COUNT(*) FROM nps.pensioners WHERE status='deceased'`
    );
    const total = parseInt(countRes.rows[0].count);

    const dataRes = await query(
      `SELECT p.id, p.pension_no, p.employee_no,
              CONCAT(p.first_name,' ',p.last_name) AS full_name,
              p.date_of_birth, p.date_of_retirement, p.date_of_death,
              p.monthly_pension, p.total_gratuity_due,
              p.deceased_on_entry,
              CASE
                WHEN p.deceased_on_entry = TRUE THEN 'Deceased on Entry'
                ELSE 'Deceased while on Payroll'
              END AS deceased_category,
              dn.notified_by, dn.death_cert_no, dn.notification_date,
              -- Gratuity status
              COALESCE(gb.total_gratuity_paid,0)            AS gratuity_paid,
              COALESCE(gb.gratuity_balance_remaining,0)      AS gratuity_balance,
              -- Was final payment made?
              (SELECT COUNT(*) FROM nps.pension_payment_lines ppl
               JOIN nps.pension_payment_runs pr ON ppl.run_id=pr.id
               WHERE ppl.pensioner_id=p.id AND pr.status='processed') AS payment_runs_count
       FROM nps.pensioners p
       LEFT JOIN nps.death_notifications dn ON dn.pensioner_id=p.id
       LEFT JOIN nps.v_gratuity_balance gb ON gb.pensioner_id=p.id
       WHERE p.status='deceased'
       ORDER BY p.date_of_death DESC NULLS LAST
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    paginated(res, dataRes.rows, total, page, limit);
  } catch (err) { next(err); }
});

export default router;

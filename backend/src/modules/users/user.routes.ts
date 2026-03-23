import { Router, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../../config/database';
import { authenticate, AuthRequest } from '../../middlewares/auth.middleware';
import { adminOnly, anyRole } from '../../middlewares/rbac.middleware';
import { success, created, paginated, notFound, badRequest } from '../../utils/responseHelper';

const router = Router();
router.use(authenticate);

// GET /api/users
router.get('/', adminOnly, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const page   = parseInt((req.query.page  as string) || '1');
    const limit  = parseInt((req.query.limit as string) || '50');
    const offset = (page - 1) * limit;

    const countRes = await query(`SELECT COUNT(*) FROM nps.system_users`);
    const total = parseInt(countRes.rows[0].count);

    const dataRes = await query(
      `SELECT
         su.id,
         su.username,
         su.email,
         su.full_name,
         su.role,
         su.status,
         su.employee_no,
         su.last_login_at,
         su.created_at,
         su.must_change_pwd,
         su.failed_login_count,
         su.locked_at,
         d.name AS department_name
       FROM nps.system_users su
       LEFT JOIN nps.departments d ON su.department_id = d.id
       ORDER BY su.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    paginated(res, dataRes.rows, total, page, limit);
  } catch (err) { next(err); }
});

// POST /api/users
router.post('/', adminOnly, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { username, email, fullName, role, departmentId, employeeNo } = req.body;

    if (!username || !email || !fullName || !role) {
      return badRequest(res, 'username, email, fullName and role are required');
    }

    // Check for duplicate username or email first (friendly error)
    const existing = await query(
      `SELECT id FROM nps.system_users WHERE username = $1 OR email = $2`,
      [username, email]
    );
    if (existing.rows.length > 0) {
      return badRequest(res, 'A user with that username or email already exists');
    }

    // Read default password from settings — admin can configure this
    const pwdSetting = await query(
      `SELECT setting_value FROM nps.system_settings WHERE setting_key = 'security.default_user_password'`
    );
    const defaultPassword = pwdSetting.rows[0]?.setting_value || 'Temp@12345';
    const hash = await bcrypt.hash(defaultPassword, 12);
    const res2 = await query(
      `INSERT INTO nps.system_users
         (username, email, password_hash, full_name, role, department_id, employee_no, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id, username, email, full_name, role, status`,
      [username, email, hash, fullName, role, departmentId || null, employeeNo || null, req.user!.userId]
    );
    created(res, { ...res2.rows[0], tempPassword: defaultPassword }, `User created. Temporary password: ${defaultPassword}`);
  } catch (err) { next(err); }
});

// GET /api/users/:id
router.get('/:id', anyRole, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const res2 = await query(
      `SELECT su.id, su.username, su.email, su.full_name, su.role, su.status,
              su.last_login_at, su.created_at, d.name AS department_name
       FROM nps.system_users su
       LEFT JOIN nps.departments d ON su.department_id = d.id
       WHERE su.id = $1`,
      [req.params.id]
    );
    if (!res2.rows[0]) return notFound(res, 'User not found');
    success(res, res2.rows[0]);
  } catch (err) { next(err); }
});

// PUT /api/users/:id
router.put('/:id', adminOnly, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { fullName, role, status, departmentId } = req.body;
    const res2 = await query(
      `UPDATE nps.system_users
       SET full_name = $1, role = $2, status = $3, department_id = $4, updated_at = NOW()
       WHERE id = $5
       RETURNING id, username, email, full_name, role, status`,
      [fullName, role, status, departmentId || null, req.params.id]
    );
    if (!res2.rows[0]) return notFound(res, 'User not found');
    success(res, res2.rows[0], 'User updated successfully');
  } catch (err) { next(err); }
});

// POST /api/users/:id/reset-password
router.post('/:id/reset-password', adminOnly, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const pwdSetting2 = await query(
      `SELECT setting_value FROM nps.system_settings WHERE setting_key = 'security.default_user_password'`
    );
    const resetPassword = pwdSetting2.rows[0]?.setting_value || 'Temp@12345';
    const hash = await bcrypt.hash(resetPassword, 12);
    const res2 = await query(
      `UPDATE nps.system_users
       SET password_hash = $1, must_change_pwd = TRUE,
           failed_login_count = 0, locked_at = NULL, updated_at = NOW()
       WHERE id = $2
       RETURNING id, username`,
      [hash, req.params.id]
    );
    if (!res2.rows[0]) return notFound(res, 'User not found');
    success(res, { tempPassword: resetPassword }, `Password reset for ${res2.rows[0].username}. Temp: ${resetPassword}`);
  } catch (err) { next(err); }
});

// POST /api/users/:id/unlock
router.post('/:id/unlock', adminOnly, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await query(
      `UPDATE nps.system_users SET locked_at = NULL, failed_login_count = 0 WHERE id = $1`,
      [req.params.id]
    );
    success(res, null, 'Account unlocked');
  } catch (err) { next(err); }
});

export default router;

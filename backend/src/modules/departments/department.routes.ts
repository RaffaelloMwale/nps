import { Router, Response, NextFunction } from 'express';
import { query } from '../../config/database';
import { authenticate, AuthRequest } from '../../middlewares/auth.middleware';
import { anyRole, adminOnly } from '../../middlewares/rbac.middleware';
import { success, created, notFound } from '../../utils/responseHelper';

// ── DEPARTMENTS ──────────────────────────────────────────────
export const departmentRouter = Router();
departmentRouter.use(authenticate);

departmentRouter.get('/', anyRole, async (_req, res: Response, next: NextFunction) => {
  try {
    const res2 = await query(
      `SELECT d.*, p.name as parent_name FROM nps.departments d
       LEFT JOIN nps.departments p ON d.parent_id=p.id
       WHERE d.is_active=TRUE ORDER BY d.name`
    );
    success(res, res2.rows);
  } catch (err) { next(err); }
});

departmentRouter.post('/', adminOnly, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { code, name, description, parentId } = req.body;
    const res2 = await query(
      `INSERT INTO nps.departments (code,name,description,parent_id) VALUES ($1,$2,$3,$4) RETURNING *`,
      [code, name, description||null, parentId||null]
    );
    created(res, res2.rows[0]);
  } catch (err) { next(err); }
});

departmentRouter.put('/:id', adminOnly, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { name, description, isActive } = req.body;
    const res2 = await query(
      `UPDATE nps.departments SET name=$1, description=$2, is_active=$3, updated_at=NOW() WHERE id=$4 RETURNING *`,
      [name, description||null, isActive??true, req.params.id]
    );
    if (!res2.rows[0]) return notFound(res, 'Department not found');
    success(res, res2.rows[0]);
  } catch (err) { next(err); }
});

// ── DESIGNATIONS ─────────────────────────────────────────────
export const designationRouter = Router();
designationRouter.use(authenticate);

designationRouter.get('/', anyRole, async (_req, res: Response, next: NextFunction) => {
  try {
    const res2 = await query(
      `SELECT * FROM nps.designations WHERE is_active=TRUE ORDER BY name`
    );
    success(res, res2.rows);
  } catch (err) { next(err); }
});

designationRouter.post('/', adminOnly, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { code, name, grade } = req.body;
    const res2 = await query(
      `INSERT INTO nps.designations (code,name,grade) VALUES ($1,$2,$3) RETURNING *`,
      [code, name, grade||null]
    );
    created(res, res2.rows[0]);
  } catch (err) { next(err); }
});

designationRouter.put('/:id', adminOnly, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { name, grade, isActive } = req.body;
    const res2 = await query(
      `UPDATE nps.designations SET name=$1, grade=$2, is_active=$3, updated_at=NOW() WHERE id=$4 RETURNING *`,
      [name, grade||null, isActive??true, req.params.id]
    );
    if (!res2.rows[0]) return notFound(res, 'Designation not found');
    success(res, res2.rows[0]);
  } catch (err) { next(err); }
});

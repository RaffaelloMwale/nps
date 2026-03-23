import { Router, Response, NextFunction } from 'express';
import { query } from '../../config/database';
import { authenticate, AuthRequest } from '../../middlewares/auth.middleware';
import { anyRole } from '../../middlewares/rbac.middleware';
import { success } from '../../utils/responseHelper';

const router = Router();
router.use(authenticate, anyRole);

// GET /api/workflow/trail/:entityType/:entityId
router.get('/trail/:entityType/:entityId', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { entityType, entityId } = req.params;
    const result = await query(
      `SELECT w.*, su.full_name as action_by_name
       FROM nps.workflow_audit_trail w
       LEFT JOIN nps.system_users su ON w.action_by = su.id
       WHERE w.entity_type=$1 AND w.entity_id=$2
       ORDER BY w.action_at ASC`,
      [entityType, entityId]
    );
    success(res, result.rows);
  } catch (err) { next(err); }
});

export default router;

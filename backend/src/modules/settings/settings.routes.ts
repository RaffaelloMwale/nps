import { Router, Response, NextFunction } from 'express';
import { query } from '../../config/database';
import { authenticate, AuthRequest } from '../../middlewares/auth.middleware';
import { adminOnly, anyRole } from '../../middlewares/rbac.middleware';
import { success, badRequest } from '../../utils/responseHelper';
import { reloadScheduler, getCurrentRunDay } from '../scheduler/scheduler';
import logger from '../../config/logger';

const router = Router();
router.use(authenticate);

// ── GET /api/settings ─────────────────────────────────────────
// All authenticated users can read settings (needed for theme/
// maintenance mode checks on the frontend).
router.get('/', anyRole, async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const res2 = await query(
      `SELECT setting_key, setting_value, description
       FROM nps.system_settings
       ORDER BY setting_key`
    );
    // Return as a flat key-value object for easy use on the frontend
    const settings: Record<string, string> = {};
    res2.rows.forEach(r => { settings[r.setting_key] = r.setting_value; });

    // Append live scheduler state so the UI can show what day the
    // cron is actually running on right now
    settings['scheduler.current_run_day'] = String(getCurrentRunDay());

    success(res, settings);
  } catch (err) { next(err); }
});

// ── PUT /api/settings ─────────────────────────────────────────
// Admin updates one or many settings keys in a single call.
// If payment.auto_run_day is among the keys, the live scheduler
// is restarted with the new day immediately — no server restart needed.
router.put('/', adminOnly, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const updates = req.body as Record<string, string>;
    if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
      return badRequest(res, 'Request body must be a key-value object, e.g. { "payment.auto_run_day": "20" }');
    }

    let runDayChanged = false;
    let newRunDay: number | null = null;

    for (const [key, value] of Object.entries(updates)) {
      // Validate auto_run_day specifically
      if (key === 'payment.auto_run_day') {
        const day = parseInt(String(value), 10);
        if (isNaN(day) || day < 1 || day > 28) {
          return badRequest(res, 'payment.auto_run_day must be a number between 1 and 28');
        }
        newRunDay      = day;
        runDayChanged  = true;
      }

      await query(
        `UPDATE nps.system_settings
         SET setting_value = $1, updated_by = $2, updated_at = NOW()
         WHERE setting_key = $3`,
        [String(value), req.user!.userId, key]
      );
    }

    // If the payment run day changed, restart the cron job NOW
    if (runDayChanged && newRunDay !== null) {
      logger.info(`[Settings] Admin changed auto_run_day to ${newRunDay} — reloading scheduler`);
      const confirmedDay = await reloadScheduler();
      logger.info(`[Settings] Scheduler now running on day ${confirmedDay}`);
    }

    // Return the full updated settings object
    const res2 = await query(`SELECT setting_key, setting_value FROM nps.system_settings`);
    const settings: Record<string, string> = {};
    res2.rows.forEach(r => { settings[r.setting_key] = r.setting_value; });
    settings['scheduler.current_run_day'] = String(getCurrentRunDay());

    success(res, settings, runDayChanged
      ? `Settings saved. Payment run scheduler restarted — will now fire on day ${newRunDay} of each month.`
      : 'Settings saved successfully'
    );
  } catch (err) { next(err); }
});

// ── POST /api/settings/maintenance ───────────────────────────
// Quick toggle for maintenance mode without needing to
// send the full settings object.
router.post('/maintenance', adminOnly, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { enabled } = req.body;
    if (typeof enabled !== 'boolean') {
      return badRequest(res, '"enabled" must be a boolean (true or false)');
    }

    await query(
      `UPDATE nps.system_settings
       SET setting_value = $1, updated_by = $2, updated_at = NOW()
       WHERE setting_key = 'system.maintenance_mode'`,
      [enabled ? 'true' : 'false', req.user!.userId]
    );

    success(res, { maintenanceMode: enabled },
      `Maintenance mode ${enabled ? 'ENABLED — only admins can log in' : 'DISABLED — all users can access normally'}`
    );
  } catch (err) { next(err); }
});

// ── GET /api/settings/scheduler/status ───────────────────────
// Returns the current live scheduler state.
router.get('/scheduler/status', adminOnly, async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const res2 = await query(
      `SELECT setting_value FROM nps.system_settings WHERE setting_key = 'payment.auto_run_day'`
    );
    const savedDay = res2.rows[0]?.setting_value || '14';
    const liveDay  = getCurrentRunDay();

    // Last few schedule log entries
    const logRes = await query(
      `SELECT schedule_month, schedule_year, scheduled_date, trigger_status, triggered_at, error_message
       FROM nps.monthly_run_schedule
       ORDER BY schedule_year DESC, schedule_month DESC
       LIMIT 6`
    );

    success(res, {
      savedRunDay:      parseInt(savedDay),
      liveRunDay:       liveDay,
      cronExpression:   `0 6 ${liveDay} * *`,
      humanDescription: `Fires at 06:00 on day ${liveDay} of every month (Africa/Blantyre timezone)`,
      recentSchedules:  logRes.rows,
    });
  } catch (err) { next(err); }
});

export default router;
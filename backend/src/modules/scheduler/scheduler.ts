import cron from 'node-cron';
import { query } from '../../config/database';
import logger from '../../config/logger';

// ── Module-level state ────────────────────────────────────────
// We keep a reference to the running cron task so we can
// stop it and restart it when the admin changes the run day.
let currentTask: cron.ScheduledTask | null = null;
let currentRunDay: number = 14; // fallback default

// ── Read the configured run day from system_settings ─────────
async function getRunDay(): Promise<number> {
  try {
    const res = await query(
      `SELECT setting_value FROM nps.system_settings WHERE setting_key = 'payment.auto_run_day'`
    );
    if (res.rows[0]) {
      const day = parseInt(res.rows[0].setting_value, 10);
      if (!isNaN(day) && day >= 1 && day <= 28) {
        return day;
      }
      logger.warn(`[Scheduler] Invalid auto_run_day value "${res.rows[0].setting_value}", using ${currentRunDay}`);
    }
  } catch (err) {
    logger.error('[Scheduler] Could not read auto_run_day from settings, using default:', err);
  }
  return currentRunDay;
}

// ── Build a cron expression for a given day-of-month ─────────
// Fires at 06:00 on the configured day every month
function buildCronExpression(day: number): string {
  return `0 6 ${day} * *`;
}

// ── The actual payment run job ────────────────────────────────
async function runPaymentJob(runDay: number) {
  const now   = new Date();
  const month = now.getMonth() + 1;
  const year  = now.getFullYear();

  logger.info(`[Scheduler] ▶ Auto payment run triggered — ${month}/${year} (configured day: ${runDay})`);

  try {
    // Re-read the day at execution time in case it was changed
    const latestDay = await getRunDay();

    // Idempotency check
    const existing = await query(
      `SELECT id FROM nps.pension_payment_runs WHERE payment_month=$1 AND payment_year=$2`,
      [month, year]
    );
    if (existing.rows.length) {
      logger.info(`[Scheduler] Run for ${month}/${year} already exists. Skipping.`);
      await logSchedule(month, year, 'skipped', latestDay, undefined, 'Run already exists');
      return;
    }

    const period        = `${year}-${String(month).padStart(2, '0')}`;
    const runCode       = `RUN-${year}-${String(month).padStart(2, '0')}`;
    const scheduledDate = new Date(year, month - 1, latestDay); // uses DB value, not hardcoded

    const runRes = await query(
      `INSERT INTO nps.pension_payment_runs
         (run_code, payment_period, payment_month, payment_year, scheduled_date,
          status, is_auto_generated, description)
       VALUES ($1,$2,$3,$4,$5,'pending',true,$6)
       RETURNING id`,
      [
        runCode, period, month, year, scheduledDate,
        `Auto-generated payment run for ${period} (scheduled day: ${latestDay})`,
      ]
    );
    const runId = runRes.rows[0].id;

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

    // Store snapshot totals on the run header
    await query(
      `UPDATE nps.pension_payment_runs
       SET total_pensioners   = $1,
           total_gross_amount = (SELECT COALESCE(SUM(gross_amount),0) FROM nps.pension_payment_lines WHERE run_id=$2),
           total_net_amount   = (SELECT COALESCE(SUM(gross_amount),0) FROM nps.pension_payment_lines WHERE run_id=$2)
       WHERE id = $2`,
      [lineRes.rowCount, runId]
    );

    logger.info(`[Scheduler] ✅ Run ${runCode} created — ${lineRes.rowCount} pensioner lines`);
    await logSchedule(month, year, 'triggered', latestDay, runId);

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[Scheduler] ❌ Auto run failed: ${msg}`);
    await logSchedule(month, year, 'failed', runDay, undefined, msg);
  }
}

// ── Start (or restart) the scheduler with a given run day ────
export function startScheduler(): void;
export function startScheduler(overrideDay: number): void;
export function startScheduler(overrideDay?: number): void {
  // Stop any existing task before starting a new one
  if (currentTask) {
    currentTask.stop();
    currentTask = null;
    logger.info('[Scheduler] Previous scheduler stopped');
  }

  // Use override if provided, otherwise resolve async below
  if (overrideDay !== undefined) {
    launchWithDay(overrideDay);
  } else {
    // Read from DB then launch
    getRunDay().then(day => launchWithDay(day));
  }
}

function launchWithDay(day: number): void {
  currentRunDay = day;
  const cronExpr = buildCronExpression(day);

  logger.info(`[Scheduler] ✅ Payment run scheduler started — fires at 06:00 on day ${day} of every month`);
  logger.info(`[Scheduler]    Cron expression: ${cronExpr}`);

  currentTask = cron.schedule(cronExpr, () => runPaymentJob(day), {
    timezone: 'Africa/Blantyre', // Malawi timezone (UTC+2)
  });
}

// ── Reload: called by settings route when admin changes the day
export async function reloadScheduler(): Promise<number> {
  const newDay = await getRunDay();
  logger.info(`[Scheduler] 🔄 Reloading scheduler with new run day: ${newDay}`);
  startScheduler(newDay);
  return newDay;
}

// ── Get current configured day (for API endpoint) ────────────
export function getCurrentRunDay(): number {
  return currentRunDay;
}

// ── Log to monthly_run_schedule ──────────────────────────────
async function logSchedule(
  month:    number,
  year:     number,
  status:   string,
  runDay:   number,
  runId?:   string,
  errorMsg?: string
) {
  try {
    const scheduledDate = new Date(year, month - 1, runDay);
    await query(
      `INSERT INTO nps.monthly_run_schedule
         (schedule_month, schedule_year, scheduled_date, trigger_status, triggered_at, run_id, error_message)
       VALUES ($1,$2,$3,$4,NOW(),$5,$6)
       ON CONFLICT (schedule_month, schedule_year)
       DO UPDATE SET
         trigger_status = $4,
         triggered_at   = NOW(),
         run_id         = $5,
         error_message  = $6`,
      [month, year, scheduledDate, status, runId || null, errorMsg || null]
    );
  } catch (e) {
    logger.error('[Scheduler] Failed to log schedule entry:', e);
  }
}

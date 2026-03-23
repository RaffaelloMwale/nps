import { Router, Response, NextFunction } from 'express';
import ExcelJS from 'exceljs';
import { query } from '../../config/database';
import { authenticate, AuthRequest } from '../../middlewares/auth.middleware';
import { anyRole } from '../../middlewares/rbac.middleware';

const router = Router();
router.use(authenticate, anyRole);

// ── EXCEL HELPERS ─────────────────────────────────────────────

interface ColDef { header: string; key: string; width: number; numFmt?: string; }

const MWK_FMT = '#,##0.00';
const DATE_FMT = 'dd-mmm-yyyy';

function buildSheet(
  wb: ExcelJS.Workbook,
  sheetName: string,
  title: string,
  subtitle: string,
  cols: ColDef[],
  rows: Record<string, any>[],
  totalCols?: string[]   // keys of columns to sum in the totals row
) {
  const ws = wb.addWorksheet(sheetName);
  const colCount = cols.length;
  const lastColLetter = colLetter(colCount);

  // ── Row 1: Main title ────────────────────────────────────────
  ws.mergeCells(`A1:${lastColLetter}1`);
  const t = ws.getCell('A1');
  t.value = 'Government of Malawi — National Pension System';
  t.font  = { bold: true, size: 14, color: { argb: 'FFFFFFFF' }, name: 'Arial' };
  t.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
  t.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 32;

  // ── Row 2: Report title ──────────────────────────────────────
  ws.mergeCells(`A2:${lastColLetter}2`);
  const r2 = ws.getCell('A2');
  r2.value = title;
  r2.font  = { bold: true, size: 12, color: { argb: 'FFFFFFFF' }, name: 'Arial' };
  r2.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E6DA4' } };
  r2.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(2).height = 24;

  // ── Row 3: Subtitle / generated date ────────────────────────
  ws.mergeCells(`A3:${lastColLetter}3`);
  const r3 = ws.getCell('A3');
  r3.value = `${subtitle}     Generated: ${new Date().toLocaleString('en-GB')}`;
  r3.font  = { italic: true, size: 10, color: { argb: 'FF555555' }, name: 'Arial' };
  r3.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E8F5' } };
  r3.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(3).height = 18;

  // ── Row 4: Column headers ────────────────────────────────────
  const hdrRow = ws.getRow(4);
  cols.forEach((col, i) => {
    const cell = hdrRow.getCell(i + 1);
    cell.value = col.header;
    cell.font  = { bold: true, size: 10, color: { argb: 'FFFFFFFF' }, name: 'Arial' };
    cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = {
      top:    { style: 'thin', color: { argb: 'FF2E6DA4' } },
      bottom: { style: 'medium', color: { argb: 'FF2E6DA4' } },
      left:   { style: 'thin', color: { argb: 'FF2E6DA4' } },
      right:  { style: 'thin', color: { argb: 'FF2E6DA4' } },
    };
    // Set column width
    ws.getColumn(i + 1).width = col.width;
  });
  hdrRow.height = 22;

  // ── Rows 5+: Data ────────────────────────────────────────────
  const totals: Record<string, number> = {};
  if (totalCols) totalCols.forEach(k => { totals[k] = 0; });

  rows.forEach((rowData, idx) => {
    const dataRow = ws.getRow(4 + 1 + idx);
    const isEven  = idx % 2 === 0;

    cols.forEach((col, ci) => {
      const cell  = dataRow.getCell(ci + 1);
      const raw   = rowData[col.key];

      // Format value
      if (col.numFmt === MWK_FMT && raw !== null && raw !== undefined && raw !== '') {
        cell.value  = parseFloat(String(raw)) || 0;
        cell.numFmt = MWK_FMT;
        // Accumulate totals
        if (totalCols?.includes(col.key)) {
          totals[col.key] = (totals[col.key] || 0) + (parseFloat(String(raw)) || 0);
        }
      } else if (col.numFmt === DATE_FMT && raw) {
        cell.value  = new Date(raw);
        cell.numFmt = DATE_FMT;
      } else {
        cell.value  = raw ?? '';
      }

      cell.font      = { size: 10, name: 'Arial', color: { argb: 'FF1E293B' } };
      cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: isEven ? 'FFF8FAFC' : 'FFFFFFFF' } };
      cell.alignment = { vertical: 'middle' };
      cell.border    = {
        bottom: { style: 'hair', color: { argb: 'FFDDDDDD' } },
        right:  { style: 'hair', color: { argb: 'FFDDDDDD' } },
      };
    });

    dataRow.height = 18;
  });

  // ── Totals row ───────────────────────────────────────────────
  if (totalCols && totalCols.length > 0) {
    const totRow = ws.getRow(4 + 1 + rows.length);
    let firstSet = false;
    cols.forEach((col, ci) => {
      const cell = totRow.getCell(ci + 1);
      if (!firstSet) {
        cell.value = `TOTAL (${rows.length} records)`;
        cell.font  = { bold: true, size: 10, name: 'Arial', color: { argb: 'FF1E3A5F' } };
        firstSet   = true;
      } else if (totalCols.includes(col.key)) {
        cell.value  = totals[col.key] || 0;
        cell.numFmt = MWK_FMT;
        cell.font   = { bold: true, size: 10, name: 'Arial', color: { argb: 'FF1E3A5F' } };
      } else {
        cell.value = '';
      }
      cell.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E8F5' } };
      cell.border = {
        top:    { style: 'medium', color: { argb: 'FF2E6DA4' } },
        bottom: { style: 'medium', color: { argb: 'FF2E6DA4' } },
      };
    });
    totRow.height = 22;
  }

  return ws;
}

function colLetter(n: number): string {
  // Converts 1→A, 26→Z, 27→AA etc.
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function sendExcel(res: Response, wb: ExcelJS.Workbook, filename: string) {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}_${Date.now()}.xlsx"`);
  wb.xlsx.write(res).then(() => res.end());
}

// ═════════════════════════════════════════════════════════════
// REPORT ENDPOINTS
// ═════════════════════════════════════════════════════════════

// ── 1. PENSIONER REGISTER ─────────────────────────────────────
router.get('/pensioner-register', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { status, departmentId } = req.query;
    const conditions = ['1=1'];
    const params: unknown[] = [];
    let i = 1;
    if (status)       { conditions.push(`p.status=$${i++}`);        params.push(status); }
    if (departmentId) { conditions.push(`p.department_id=$${i++}`); params.push(departmentId); }

    const rows = await query(
      `SELECT
         p.pension_no, p.employee_no,
         CONCAT(COALESCE(p.title||' ',''), p.first_name,' ',p.last_name) AS full_name,
         p.gender, p.date_of_birth,
         d.name  AS department,
         p.designation_at_retirement AS designation,
         COALESCE(p.grade_at_retirement, ds.grade)      AS grade,
         p.grade_at_first_appointment,
         p.date_of_first_appointment, p.date_of_retirement,
         p.years_of_service,
         p.monthly_pension, p.total_gratuity_due,
         p.pension_start_date, p.status,
         su.full_name AS introduced_by,
         p.created_at AS introduced_date
       FROM nps.pensioners p
       LEFT JOIN nps.departments  d  ON p.department_id  = d.id
       LEFT JOIN nps.system_users su ON p.introduced_by  = su.id
       WHERE ${conditions.join(' AND ')}
       ORDER BY p.last_name, p.first_name`,
      params
    );

    const wb = new ExcelJS.Workbook();
    buildSheet(wb, 'Pensioner Register', 'Pensioner Register',
      `Status: ${status || 'All'} | Total: ${rows.rows.length} pensioners`,
      [
        { header: 'Pension No',          key: 'pension_no',                width: 16 },
        { header: 'Employee No',         key: 'employee_no',               width: 14 },
        { header: 'Full Name',           key: 'full_name',                 width: 30 },
        { header: 'Gender',              key: 'gender',                    width: 10 },
        { header: 'Date of Birth',       key: 'date_of_birth',             width: 14, numFmt: DATE_FMT },
        { header: 'Department',          key: 'department',                width: 26 },
        { header: 'Designation at Retirement', key: 'designation',         width: 28 },
        { header: 'Grade (Retirement)',  key: 'grade',                     width: 16 },
        { header: 'Grade (1st Appt)',    key: 'grade_at_first_appointment',width: 16 },
        { header: 'First Appointment',   key: 'date_of_first_appointment', width: 16, numFmt: DATE_FMT },
        { header: 'Retirement Date',     key: 'date_of_retirement',        width: 16, numFmt: DATE_FMT },
        { header: 'Years of Service',    key: 'years_of_service',          width: 14 },
        { header: 'Monthly Pension (MWK)', key: 'monthly_pension',         width: 22, numFmt: MWK_FMT },
        { header: 'Total Gratuity Due (MWK)', key: 'total_gratuity_due',   width: 24, numFmt: MWK_FMT },
        { header: 'Pension Start',       key: 'pension_start_date',        width: 14, numFmt: DATE_FMT },
        { header: 'Status',              key: 'status',                    width: 12 },
        { header: 'Introduced By',       key: 'introduced_by',             width: 22 },
        { header: 'Introduced Date',     key: 'introduced_date',           width: 16, numFmt: DATE_FMT },
      ],
      rows.rows,
      ['monthly_pension', 'total_gratuity_due']
    );
    sendExcel(res, wb, 'Pensioner_Register');
  } catch (err) { next(err); }
});

// ── 2. MONTHLY PAYMENT REGISTER ──────────────────────────────
router.get('/payment-run/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    // Fetch run header
    const runRes = await query(
      `SELECT pr.*,
              u1.full_name AS created_by_name,
              u2.full_name AS approved_by_1_name,
              u3.full_name AS approved_by_2_name
       FROM nps.pension_payment_runs pr
       LEFT JOIN nps.system_users u1 ON pr.created_by    = u1.id
       LEFT JOIN nps.system_users u2 ON pr.approved_by_1 = u2.id
       LEFT JOIN nps.system_users u3 ON pr.approved_by_2 = u3.id
       WHERE pr.id = $1`,
      [req.params.id]
    );

    if (!runRes.rows[0]) {
      res.status(404).json({ success: false, message: 'Payment run not found' });
      return;
    }
    const run = runRes.rows[0];

    // Fetch all payment lines (no pagination — full export)
    const linesRes = await query(
      `SELECT
         p.pension_no,
         CONCAT(COALESCE(p.title||' ',''), p.first_name,' ',p.last_name) AS full_name,
         d.name  AS department,
         p.designation_at_retirement AS designation,
         ba.bank_name,
         ba.branch_name,
         CASE WHEN ba.account_number IS NOT NULL
              THEN CONCAT('****', RIGHT(ba.account_number, 4))
              ELSE '(no account)'
         END AS account_masked,
         ba.account_type,
         ppl.gross_amount,
         ppl.tax_deduction,
         ppl.other_deductions,
         ppl.total_deductions,
         ppl.net_amount,
         ppl.status,
         ppl.payment_ref,
         ppl.transaction_ref
       FROM nps.pension_payment_lines ppl
       JOIN nps.pensioners p ON ppl.pensioner_id = p.id
       LEFT JOIN nps.departments  d  ON p.department_id  = d.id
       LEFT JOIN nps.bank_accounts ba ON ppl.bank_account_id = ba.id
       WHERE ppl.run_id = $1
       ORDER BY p.last_name, p.first_name`,
      [req.params.id]
    );

    const wb = new ExcelJS.Workbook();
    const subtitle =
      `Period: ${run.payment_period} | ` +
      `Run: ${run.run_code} | ` +
      `Status: ${run.status.toUpperCase()} | ` +
      `Pensioners: ${run.total_pensioners} | ` +
      `Approved by: ${run.approved_by_2_name || run.approved_by_1_name || 'Pending'}`;

    buildSheet(
      wb,
      'Payment Register',
      `Monthly Pension Payment Register — ${run.payment_period}`,
      subtitle,
      [
        { header: 'Pension No',       key: 'pension_no',       width: 16 },
        { header: 'Full Name',        key: 'full_name',        width: 30 },
        { header: 'Department',       key: 'department',       width: 24 },
        { header: 'Designation at Retirement', key: 'designation',      width: 28 },
        { header: 'Bank',             key: 'bank_name',        width: 22 },
        { header: 'Branch',           key: 'branch_name',      width: 18 },
        { header: 'Account (Masked)', key: 'account_masked',   width: 18 },
        { header: 'Gross (MWK)',      key: 'gross_amount',     width: 20, numFmt: MWK_FMT },
        { header: 'Tax Ded (MWK)',    key: 'tax_deduction',    width: 18, numFmt: MWK_FMT },
        { header: 'Other Ded (MWK)',  key: 'other_deductions', width: 18, numFmt: MWK_FMT },
        { header: 'Total Ded (MWK)', key: 'total_deductions', width: 18, numFmt: MWK_FMT },
        { header: 'Net Amount (MWK)', key: 'net_amount',       width: 20, numFmt: MWK_FMT },
        { header: 'Status',           key: 'status',           width: 12 },
        { header: 'Payment Ref',      key: 'payment_ref',      width: 18 },
        { header: 'Transaction Ref',  key: 'transaction_ref',  width: 22 },
      ],
      linesRes.rows,
      ['gross_amount', 'tax_deduction', 'other_deductions', 'total_deductions', 'net_amount']
    );

    sendExcel(res, wb, `Payment_Run_${run.payment_period}`);
  } catch (err) { next(err); }
});

// ── 3. GRATUITY SCHEDULE ──────────────────────────────────────
router.get('/gratuity-schedule', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { status, gratuityType } = req.query;
    const conditions = ['1=1'];
    const params: unknown[] = [];
    let i = 1;
    if (status)       { conditions.push(`gr.status=$${i++}`);       params.push(status); }
    if (gratuityType) { conditions.push(`gr.gratuity_type=$${i++}`);params.push(gratuityType); }

    const rows = await query(
      `SELECT
         p.pension_no,
         CONCAT(p.first_name,' ',p.last_name) AS full_name,
         d.name AS department,
         gr.gratuity_ref, gr.gratuity_type,
         gr.is_partial, gr.partial_reason,
         gr.total_gratuity_due_snapshot AS total_due,
         gr.amount_requested,
         gr.status, gr.claim_date, gr.payment_date,
         u1.full_name AS created_by_name,
         u2.full_name AS approved_by_1_name,
         u3.full_name AS approved_by_2_name
       FROM nps.gratuity_records gr
       JOIN nps.pensioners p ON gr.pensioner_id = p.id
       LEFT JOIN nps.departments d ON p.department_id = d.id
       LEFT JOIN nps.system_users u1 ON gr.created_by   = u1.id
       LEFT JOIN nps.system_users u2 ON gr.approved_by_1 = u2.id
       LEFT JOIN nps.system_users u3 ON gr.approved_by_2 = u3.id
       WHERE ${conditions.join(' AND ')}
       ORDER BY gr.created_at DESC`,
      params
    );

    const wb = new ExcelJS.Workbook();
    buildSheet(wb, 'Gratuity Schedule', 'Gratuity Schedule',
      `Status: ${status || 'All'} | Type: ${gratuityType || 'All'} | Records: ${rows.rows.length}`,
      [
        { header: 'Pension No',       key: 'pension_no',   width: 16 },
        { header: 'Full Name',        key: 'full_name',    width: 30 },
        { header: 'Department',       key: 'department',   width: 24 },
        { header: 'Ref',              key: 'gratuity_ref', width: 18 },
        { header: 'Type',             key: 'gratuity_type',width: 12 },
        { header: 'Partial?',         key: 'is_partial',   width: 10 },
        { header: 'Total Due (MWK)',  key: 'total_due',    width: 20, numFmt: MWK_FMT },
        { header: 'Amount (MWK)',     key: 'amount_requested', width: 20, numFmt: MWK_FMT },
        { header: 'Status',           key: 'status',       width: 14 },
        { header: 'Claim Date',       key: 'claim_date',   width: 14, numFmt: DATE_FMT },
        { header: 'Payment Date',     key: 'payment_date', width: 14, numFmt: DATE_FMT },
        { header: 'Partial Reason',   key: 'partial_reason',width: 28 },
        { header: 'Created By',       key: 'created_by_name',   width: 20 },
        { header: 'Approved L1',      key: 'approved_by_1_name',width: 20 },
        { header: 'Approved L2',      key: 'approved_by_2_name',width: 20 },
      ],
      rows.rows,
      ['total_due', 'amount_requested']
    );
    sendExcel(res, wb, 'Gratuity_Schedule');
  } catch (err) { next(err); }
});

// ── 4. GRATUITY DUE (outstanding balances) ───────────────────
router.get('/gratuity-due', async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const rows = await query(`SELECT * FROM nps.v_gratuity_due`);
    const wb = new ExcelJS.Workbook();
    buildSheet(wb, 'Gratuity Due', 'Outstanding Gratuity Balances',
      `Pensioners with outstanding gratuity — sorted by balance descending | Records: ${rows.rows.length}`,
      [
        { header: 'Pension No',        key: 'pension_no',                 width: 16 },
        { header: 'Full Name',         key: 'full_name',                  width: 30 },
        { header: 'Department',        key: 'department_name',            width: 24 },
        { header: 'Total Due (MWK)',   key: 'total_gratuity_due',         width: 22, numFmt: MWK_FMT },
        { header: 'Total Paid (MWK)',  key: 'total_gratuity_paid',        width: 22, numFmt: MWK_FMT },
        { header: 'Balance (MWK)',     key: 'gratuity_balance_remaining', width: 22, numFmt: MWK_FMT },
        { header: 'Partial Payments', key: 'partial_payments_count',     width: 16 },
        { header: 'Last Paid',         key: 'last_paid_date',             width: 14, numFmt: DATE_FMT },
      ],
      rows.rows,
      ['total_gratuity_due','total_gratuity_paid','gratuity_balance_remaining']
    );
    sendExcel(res, wb, 'Gratuity_Due');
  } catch (err) { next(err); }
});

// ── 5. PARTIAL GRATUITY RECIPIENTS ───────────────────────────
router.get('/partial-gratuity', async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const rows = await query(`SELECT * FROM nps.v_partial_gratuity_recipients`);
    const wb = new ExcelJS.Workbook();
    buildSheet(wb, 'Partial Gratuity', 'Partial Gratuity Recipients',
      `Pensioners who have received at least one partial gratuity payment | Records: ${rows.rows.length}`,
      [
        { header: 'Pension No',       key: 'pension_no',                 width: 16 },
        { header: 'Full Name',        key: 'full_name',                  width: 30 },
        { header: 'Department',       key: 'department_name',            width: 24 },
        { header: 'Total Due (MWK)', key: 'total_gratuity_due',          width: 22, numFmt: MWK_FMT },
        { header: 'Total Paid (MWK)',key: 'total_gratuity_paid',         width: 22, numFmt: MWK_FMT },
        { header: 'Balance (MWK)',   key: 'gratuity_balance_remaining',  width: 22, numFmt: MWK_FMT },
        { header: 'No. of Partials', key: 'partial_payments_count',      width: 14 },
        { header: 'Partial Amounts', key: 'partial_amounts',             width: 30 },
        { header: 'Partial Dates',   key: 'partial_dates',               width: 30 },
        { header: 'First Paid',      key: 'first_paid_date',             width: 14, numFmt: DATE_FMT },
        { header: 'Last Paid',       key: 'last_paid_date',              width: 14, numFmt: DATE_FMT },
      ],
      rows.rows,
      ['total_gratuity_due','total_gratuity_paid','gratuity_balance_remaining']
    );
    sendExcel(res, wb, 'Partial_Gratuity');
  } catch (err) { next(err); }
});

// ── 6. ARREARS SCHEDULE ───────────────────────────────────────
router.get('/arrears-schedule', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { status } = req.query;
    const conditions = ['1=1'];
    const params: unknown[] = [];
    if (status) { conditions.push(`a.status=$1`); params.push(status); }

    const rows = await query(
      `SELECT
         a.arrear_ref, p.pension_no,
         CONCAT(p.first_name,' ',p.last_name) AS full_name,
         d.name AS department,
         a.arrear_type, a.description,
         a.from_period, a.to_period,
         a.computed_amount, a.paid_amount, a.balance_amount,
         a.status, a.approved_at, a.paid_at
       FROM nps.arrears a
       JOIN nps.pensioners p ON a.pensioner_id = p.id
       LEFT JOIN nps.departments d ON p.department_id = d.id
       WHERE ${conditions.join(' AND ')}
       ORDER BY a.created_at DESC`,
      params
    );

    const wb = new ExcelJS.Workbook();
    buildSheet(wb, 'Arrears', 'Arrears Schedule',
      `Status: ${status || 'All'} | Records: ${rows.rows.length}`,
      [
        { header: 'Arrear Ref',      key: 'arrear_ref',      width: 18 },
        { header: 'Pension No',      key: 'pension_no',      width: 16 },
        { header: 'Full Name',       key: 'full_name',       width: 30 },
        { header: 'Department',      key: 'department',      width: 22 },
        { header: 'Type',            key: 'arrear_type',     width: 18 },
        { header: 'Description',     key: 'description',     width: 36 },
        { header: 'Period From',     key: 'from_period',     width: 14 },
        { header: 'Period To',       key: 'to_period',       width: 14 },
        { header: 'Amount (MWK)',    key: 'computed_amount', width: 20, numFmt: MWK_FMT },
        { header: 'Paid (MWK)',      key: 'paid_amount',     width: 18, numFmt: MWK_FMT },
        { header: 'Balance (MWK)',   key: 'balance_amount',  width: 18, numFmt: MWK_FMT },
        { header: 'Status',          key: 'status',          width: 12 },
        { header: 'Approved Date',   key: 'approved_at',     width: 16, numFmt: DATE_FMT },
        { header: 'Paid Date',       key: 'paid_at',         width: 16, numFmt: DATE_FMT },
      ],
      rows.rows,
      ['computed_amount','paid_amount','balance_amount']
    );
    sendExcel(res, wb, 'Arrears_Schedule');
  } catch (err) { next(err); }
});

// ── 7. DEATH BENEFITS ─────────────────────────────────────────
router.get('/death-benefits', async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const rows = await query(
      `SELECT
         p.pension_no, p.employee_no,
         CONCAT(p.first_name,' ',p.last_name) AS full_name,
         d.name AS department,
         p.date_of_birth, p.date_of_retirement, p.date_of_death,
         p.monthly_pension, p.total_gratuity_due,
         CASE WHEN p.deceased_on_entry THEN 'Deceased on Entry'
              ELSE 'Deceased while on Payroll' END AS deceased_category,
         dn.notified_by, dn.death_cert_no, dn.notification_date,
         COALESCE(gb.total_gratuity_paid,0)           AS gratuity_paid,
         COALESCE(gb.gratuity_balance_remaining,0)     AS gratuity_balance,
         (SELECT COUNT(*) FROM nps.pension_payment_lines ppl
          JOIN nps.pension_payment_runs pr ON ppl.run_id=pr.id
          WHERE ppl.pensioner_id=p.id AND pr.status='processed') AS payment_runs_count
       FROM nps.pensioners p
       LEFT JOIN nps.departments d ON p.department_id=d.id
       LEFT JOIN nps.death_notifications dn ON dn.pensioner_id=p.id
       LEFT JOIN nps.v_gratuity_balance gb ON gb.pensioner_id=p.id
       WHERE p.status='deceased'
       ORDER BY p.date_of_death DESC NULLS LAST`
    );

    const wb = new ExcelJS.Workbook();
    buildSheet(wb, 'Death Benefits', 'Death Benefits Register',
      `All deceased pensioners | Records: ${rows.rows.length}`,
      [
        { header: 'Pension No',         key: 'pension_no',          width: 16 },
        { header: 'Employee No',        key: 'employee_no',         width: 14 },
        { header: 'Full Name',          key: 'full_name',           width: 30 },
        { header: 'Department',         key: 'department',          width: 22 },
        { header: 'Date of Birth',      key: 'date_of_birth',       width: 14, numFmt: DATE_FMT },
        { header: 'Retirement Date',    key: 'date_of_retirement',  width: 16, numFmt: DATE_FMT },
        { header: 'Date of Death',      key: 'date_of_death',       width: 14, numFmt: DATE_FMT },
        { header: 'Category',           key: 'deceased_category',   width: 26 },
        { header: 'Monthly Pension (MWK)', key: 'monthly_pension',  width: 22, numFmt: MWK_FMT },
        { header: 'Total Gratuity Due (MWK)', key: 'total_gratuity_due', width: 24, numFmt: MWK_FMT },
        { header: 'Gratuity Paid (MWK)',key: 'gratuity_paid',       width: 22, numFmt: MWK_FMT },
        { header: 'Gratuity Balance (MWK)',key: 'gratuity_balance', width: 22, numFmt: MWK_FMT },
        { header: 'Death Cert No',      key: 'death_cert_no',       width: 18 },
        { header: 'Notified By',        key: 'notified_by',         width: 22 },
        { header: 'Payment Runs Count', key: 'payment_runs_count',  width: 18 },
      ],
      rows.rows,
      ['monthly_pension','total_gratuity_due','gratuity_paid','gratuity_balance']
    );
    sendExcel(res, wb, 'Death_Benefits');
  } catch (err) { next(err); }
});

// ── 8. NEW INTRODUCTIONS ──────────────────────────────────────
router.get('/new-introductions', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { from, to } = req.query;
    const conditions = ['1=1'];
    const params: unknown[] = [];
    let i = 1;
    if (from) { conditions.push(`p.created_at >= $${i++}`); params.push(from); }
    if (to)   { conditions.push(`p.created_at <= $${i++}`); params.push(to); }

    const rows = await query(
      `SELECT
         p.pension_no, p.employee_no,
         CONCAT(p.first_name,' ',p.last_name) AS full_name,
         d.name  AS department,
         p.designation_at_retirement AS designation,
         p.date_of_retirement, p.monthly_pension, p.total_gratuity_due,
         su.full_name AS introduced_by, p.created_at AS introduced_date
       FROM nps.pensioners p
       LEFT JOIN nps.departments  d  ON p.department_id  = d.id
       LEFT JOIN nps.system_users su ON p.introduced_by  = su.id
       WHERE ${conditions.join(' AND ')}
       ORDER BY p.created_at DESC`,
      params
    );

    const wb = new ExcelJS.Workbook();
    buildSheet(wb, 'New Introductions', 'New Pensioner Introductions',
      `Period: ${from || 'All'} to ${to || 'All'} | Records: ${rows.rows.length}`,
      [
        { header: 'Pension No',           key: 'pension_no',        width: 16 },
        { header: 'Employee No',          key: 'employee_no',       width: 14 },
        { header: 'Full Name',            key: 'full_name',         width: 30 },
        { header: 'Department',           key: 'department',        width: 24 },
        { header: 'Designation at Retirement', key: 'designation',   width: 28 },
        { header: 'Retirement Date',      key: 'date_of_retirement',width: 16, numFmt: DATE_FMT },
        { header: 'Monthly Pension (MWK)',key: 'monthly_pension',   width: 22, numFmt: MWK_FMT },
        { header: 'Total Gratuity (MWK)', key: 'total_gratuity_due',width: 24, numFmt: MWK_FMT },
        { header: 'Introduced By',        key: 'introduced_by',     width: 22 },
        { header: 'Introduced Date',      key: 'introduced_date',   width: 18, numFmt: DATE_FMT },
      ],
      rows.rows,
      ['monthly_pension','total_gratuity_due']
    );
    sendExcel(res, wb, 'New_Introductions');
  } catch (err) { next(err); }
});

export default router;

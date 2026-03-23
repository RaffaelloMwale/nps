-- ============================================================
-- NPS DATABASE SEED FILE  v2 (fixed)
-- Run this AFTER schema.sql
-- ============================================================

SET search_path TO nps, public;

-- ── DEPARTMENTS ──────────────────────────────────────────────
INSERT INTO nps.departments (code, name) VALUES
  ('MOF',  'Ministry of Finance'),
  ('MOH',  'Ministry of Health'),
  ('MOE',  'Ministry of Education'),
  ('MOP',  'Ministry of Public Works'),
  ('MOA',  'Ministry of Agriculture'),
  ('MPS',  'Malawi Police Service'),
  ('MDF',  'Malawi Defence Force'),
  ('MOCI', 'Ministry of Commerce and Industry')
ON CONFLICT (code) DO NOTHING;

-- ── DESIGNATIONS ─────────────────────────────────────────────
INSERT INTO nps.designations (code, name, grade) VALUES
  ('PS',    'Principal Secretary',        'P1'),
  ('DS',    'Deputy Secretary',           'P2'),
  ('SNO',   'Senior Nursing Officer',     'P3'),
  ('DEO',   'District Education Officer', 'P3'),
  ('ACCT',  'Accountant',                 'P4'),
  ('ASSR',  'Assistant Secretary',        'P4'),
  ('NURSE', 'Registered Nurse',           'P5'),
  ('TEACH', 'Teacher',                    'P5'),
  ('CLERK', 'Senior Clerk',               'P6'),
  ('DRIV',  'Driver',                     'P7')
ON CONFLICT (code) DO NOTHING;

-- ── SYSTEM USERS ─────────────────────────────────────────────
-- admin = Admin@123456 | others = Temp@12345
INSERT INTO nps.system_users (username, email, password_hash, full_name, role, must_change_pwd) VALUES
  ('admin',      'admin@pension.mw',     '$2b$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uRrhZBkDa', 'System Administrator', 'admin',      false),
  ('creator1',   'creator1@pension.mw',  '$2b$12$LQv3c1yqBwEHxPdCkDSKA.7s9GjAnBaRIiCy8TSMOPjTMbXLEF5Di', 'Mary Banda',           'creator',    true),
  ('approver1a', 'approver1@pension.mw', '$2b$12$LQv3c1yqBwEHxPdCkDSKA.7s9GjAnBaRIiCy8TSMOPjTMbXLEF5Di', 'James Phiri',          'approver_1', true),
  ('approver2a', 'approver2@pension.mw', '$2b$12$LQv3c1yqBwEHxPdCkDSKA.7s9GjAnBaRIiCy8TSMOPjTMbXLEF5Di', 'Grace Mwale',          'approver_2', true)
ON CONFLICT (username) DO NOTHING;

-- ── SAMPLE PENSIONERS ────────────────────────────────────────
DO $$
DECLARE
  v_dept_mof  UUID;
  v_dept_moh  UUID;
  v_dept_moe  UUID;
  v_des_ps    UUID;
  v_des_nurse UUID;
  v_des_teach UUID;
  v_des_acct  UUID;
  v_creator   UUID;
BEGIN
  SELECT id INTO v_dept_mof  FROM nps.departments  WHERE code = 'MOF';
  SELECT id INTO v_dept_moh  FROM nps.departments  WHERE code = 'MOH';
  SELECT id INTO v_dept_moe  FROM nps.departments  WHERE code = 'MOE';
  SELECT id INTO v_des_ps    FROM nps.designations WHERE code = 'PS';
  SELECT id INTO v_des_nurse FROM nps.designations WHERE code = 'NURSE';
  SELECT id INTO v_des_teach FROM nps.designations WHERE code = 'TEACH';
  SELECT id INTO v_des_acct  FROM nps.designations WHERE code = 'ACCT';
  SELECT id INTO v_creator   FROM nps.system_users WHERE username = 'admin';

  INSERT INTO nps.pensioners
    (pension_no, employee_no, first_name, last_name, gender, date_of_birth,
     national_id, department_id, designation_id, employment_type,
     date_of_first_appointment, date_of_retirement, years_of_service,
     monthly_pension, total_gratuity_due, pension_start_date, status, introduced_by)
  VALUES
    ('PEN-2024-0001', 'EMP-1001', 'John', 'Chirwa', 'male', '1958-03-15',
     '1001234567', v_dept_mof, v_des_ps, 'permanent',
     '1985-01-10', '2023-03-15', 38.17,
     285000.00, 10836450.00, '2023-04-01', 'active', v_creator)
  ON CONFLICT (pension_no) DO NOTHING;

  INSERT INTO nps.pensioners
    (pension_no, employee_no, first_name, last_name, gender, date_of_birth,
     national_id, department_id, designation_id, employment_type,
     date_of_first_appointment, date_of_retirement, years_of_service,
     monthly_pension, total_gratuity_due, pension_start_date, status, introduced_by)
  VALUES
    ('PEN-2024-0002', 'EMP-1002', 'Agnes', 'Mbewe', 'female', '1960-07-22',
     '1002345678', v_dept_moh, v_des_nurse, 'permanent',
     '1988-06-01', '2023-07-22', 35.13,
     125000.00, 4391250.00, '2023-08-01', 'active', v_creator)
  ON CONFLICT (pension_no) DO NOTHING;

  INSERT INTO nps.pensioners
    (pension_no, employee_no, first_name, last_name, gender, date_of_birth,
     national_id, department_id, designation_id, employment_type,
     date_of_first_appointment, date_of_retirement, years_of_service,
     monthly_pension, total_gratuity_due, pension_start_date, status, introduced_by)
  VALUES
    ('PEN-2024-0003', 'EMP-1003', 'Peter', 'Gondwe', 'male', '1962-11-05',
     '1003456789', v_dept_moe, v_des_teach, 'permanent',
     '1990-01-15', '2022-11-05', 32.82,
     98000.00, 3216420.00, '2022-12-01', 'active', v_creator)
  ON CONFLICT (pension_no) DO NOTHING;

  INSERT INTO nps.pensioners
    (pension_no, employee_no, first_name, last_name, gender, date_of_birth,
     national_id, department_id, designation_id, employment_type,
     date_of_first_appointment, date_of_retirement, years_of_service,
     monthly_pension, total_gratuity_due, pension_start_date, status, introduced_by)
  VALUES
    ('PEN-2023-0015', 'EMP-0892', 'Esther', 'Tembo', 'female', '1955-04-18',
     '1004567890', v_dept_mof, v_des_acct, 'permanent',
     '1980-09-01', '2020-04-18', 39.63,
     210000.00, 8322300.00, '2020-05-01', 'active', v_creator)
  ON CONFLICT (pension_no) DO NOTHING;

  INSERT INTO nps.pensioners
    (pension_no, employee_no, first_name, last_name, gender, date_of_birth,
     national_id, department_id, designation_id, employment_type,
     date_of_first_appointment, date_of_retirement, date_of_death,
     years_of_service, monthly_pension, total_gratuity_due,
     pension_start_date, status, introduced_by)
  VALUES
    ('PEN-2022-0041', 'EMP-0756', 'Robert', 'Nyirenda', 'male', '1950-12-01',
     '1005678901', v_dept_moh, v_des_nurse, 'permanent',
     '1975-03-01', '2015-12-01', '2024-01-15',
     40.75, 175000.00, 7131250.00,
     '2016-01-01', 'deceased', v_creator)
  ON CONFLICT (pension_no) DO NOTHING;

  RAISE NOTICE 'Pensioners inserted';
END $$;

-- ── BANK ACCOUNTS ────────────────────────────────────────────
INSERT INTO nps.bank_accounts
  (pensioner_id, bank_name, branch_name, account_number, account_name,
   account_type, is_primary, is_active, effective_from)
SELECT
  p.id,
  'National Bank of Malawi',
  'Blantyre Main',
  '0' || LPAD((ROW_NUMBER() OVER (ORDER BY p.pension_no))::text, 9, '0'),
  p.first_name || ' ' || p.last_name,
  'savings',
  true,
  true,
  COALESCE(p.pension_start_date, '2020-01-01')
FROM nps.pensioners p
WHERE NOT EXISTS (
  SELECT 1 FROM nps.bank_accounts ba WHERE ba.pensioner_id = p.id
);

-- ── SAMPLE PARTIAL GRATUITY ───────────────────────────────────
INSERT INTO nps.gratuity_records
  (gratuity_ref, pensioner_id, gratuity_type, claim_date,
   total_gratuity_due_snapshot, amount_requested,
   is_partial, partial_reason, status, paid_at)
SELECT
  'GR-2024-0001',
  p.id,
  'partial',
  '2024-02-01',
  p.total_gratuity_due,
  2000000.00,
  true,
  'Urgent medical expenses',
  'paid',
  '2024-02-15 10:00:00'
FROM nps.pensioners p
WHERE p.pension_no = 'PEN-2023-0015'
ON CONFLICT (gratuity_ref) DO NOTHING;

SELECT 'Seed data loaded successfully' AS result;
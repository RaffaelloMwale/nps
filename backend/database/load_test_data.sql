-- =========================================
-- NPS BULK DATA GENERATION SCRIPT
-- =========================================

SET search_path TO nps;

-- ⚡ PERFORMANCE SETTINGS
SET synchronous_commit = OFF;
SET work_mem = '256MB';

-- =========================================
-- 1. DEPARTMENTS
-- =========================================
INSERT INTO departments (code, name)
SELECT 'DPT' || i, 'Department ' || i
FROM generate_series(1, 50) i
ON CONFLICT DO NOTHING;

-- =========================================
-- 2. DESIGNATIONS
-- =========================================
INSERT INTO designations (code, name, grade)
SELECT 'DSG' || i, 'Designation ' || i, 'G' || (i % 10)
FROM generate_series(1, 50) i
ON CONFLICT DO NOTHING;

-- =========================================
-- 3. SYSTEM USERS
-- =========================================
INSERT INTO system_users (
    username, email, password_hash, full_name, role
)
SELECT 
    'user_' || i,
    'user_' || i || '@mail.com',
    md5(random()::text),
    'User ' || i,
    (ARRAY['admin','creator','approver_1','approver_2'])[floor(random()*4+1)]::nps.user_role
FROM generate_series(1, 100) i
ON CONFLICT DO NOTHING;

-- =========================================
-- 4. PENSIONERS (1,000,000)
-- =========================================
INSERT INTO pensioners (
    pension_no,
    employee_no,
    first_name,
    last_name,
    gender,
    date_of_birth,
    department_id,
    designation_id,
    date_of_first_appointment,
    monthly_pension,
    total_gratuity_due
)
SELECT
    'PEN' || i,
    'EMP' || i,
    'First_' || i,
    'Last_' || i,
    (ARRAY['male','female'])[floor(random()*2+1)]::nps.gender_type,
    DATE '1960-01-01' + (random() * 10000)::int,
    (SELECT id FROM departments ORDER BY random() LIMIT 1),
    (SELECT id FROM designations ORDER BY random() LIMIT 1),
    DATE '1990-01-01' + (random() * 10000)::int,
    (random() * 500000)::numeric(15,2),
    (random() * 10000000)::numeric(18,2)
FROM generate_series(1, 1000000) i;

-- =========================================
-- 5. BANK ACCOUNTS
-- =========================================
INSERT INTO bank_accounts (
    pensioner_id,
    bank_name,
    account_number,
    account_name,
    is_primary,
    effective_from
)
SELECT
    p.id,
    'National Bank',
    'ACC' || row_number() OVER (),
    p.first_name || ' ' || p.last_name,
    TRUE,
    CURRENT_DATE
FROM pensioners p;

-- =========================================
-- 6. PAYMENT RUN
-- =========================================
INSERT INTO pension_payment_runs (
    run_code,
    payment_period,
    payment_month,
    payment_year,
    scheduled_date
)
VALUES ('RUN-2026-01', '2026-01', 1, 2026, CURRENT_DATE)
ON CONFLICT DO NOTHING;

-- =========================================
-- 7. PAYMENT LINES (1M)
-- =========================================
INSERT INTO pension_payment_lines (
    run_id,
    pensioner_id,
    bank_account_id,
    gross_amount
)
SELECT
    (SELECT id FROM pension_payment_runs LIMIT 1),
    p.id,
    ba.id,
    p.monthly_pension
FROM pensioners p
LEFT JOIN bank_accounts ba ON ba.pensioner_id = p.id;

-- =========================================
-- DONE
-- =========================================
SELECT 'DATA LOAD COMPLETE ✅' AS status;
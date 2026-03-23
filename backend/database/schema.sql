-- ============================================================
-- NATIONAL PENSION SYSTEM (NPS) - DATABASE SCHEMA
-- Database: PostgreSQL 15+
-- Version: 2.0.0
-- ============================================================
-- DESIGN PRINCIPLES:
--   - Monthly pension amount is entered directly at registration.
--     The system does NOT compute it from salary or rates.
--   - Total gratuity due is entered directly at registration.
--     The system does NOT compute it from years of service or rates.
--   - On the 14th of every month the system auto-generates a
--     pension payment run for all active pensioners using their
--     stored monthly_pension amount.
--   - Gratuity balance = total_gratuity_due - sum of all paid
--     gratuity amounts; tracked via v_gratuity_balance view.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE SCHEMA IF NOT EXISTS nps;
SET search_path TO nps, public;

-- ============================================================
-- ENUMERATIONS
-- ============================================================

CREATE TYPE user_role AS ENUM ('admin', 'creator', 'approver_1', 'approver_2');
CREATE TYPE user_status AS ENUM ('active', 'inactive', 'suspended');
CREATE TYPE gender_type AS ENUM ('male', 'female', 'other');
CREATE TYPE pension_status AS ENUM ('active', 'suspended', 'terminated', 'deceased');
CREATE TYPE payment_status AS ENUM (
    'pending', 'submitted', 'approved_1', 'approved_2', 'processed', 'failed', 'reversed'
);
CREATE TYPE gratuity_type AS ENUM ('full', 'partial', 'death');
CREATE TYPE gratuity_status AS ENUM (
    'pending', 'submitted', 'approved_1', 'approved_2', 'paid', 'rejected'
);
CREATE TYPE arrear_status AS ENUM ('pending', 'approved', 'paid', 'cancelled');
CREATE TYPE document_type AS ENUM (
    'national_id', 'passport', 'birth_certificate', 'death_certificate',
    'appointment_letter', 'pension_award_letter', 'gratuity_award_letter',
    'bank_confirmation', 'other'
);
CREATE TYPE workflow_action AS ENUM (
    'created', 'submitted', 'approved_1', 'approved_2', 'rejected', 'reversed', 'paid', 'cancelled'
);
CREATE TYPE employment_type AS ENUM ('permanent', 'contract', 'casual');
CREATE TYPE bank_account_type AS ENUM ('savings', 'current', 'mobile_money');
CREATE TYPE autorun_status AS ENUM ('pending', 'triggered', 'skipped', 'failed');

-- ============================================================
-- TABLE: departments
-- ============================================================
CREATE TABLE departments (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code        VARCHAR(20)  NOT NULL UNIQUE,
    name        VARCHAR(200) NOT NULL,
    description TEXT,
    parent_id   UUID REFERENCES departments(id),
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE: designations
-- No pension_rate or gratuity_rate — amounts entered directly.
-- ============================================================
CREATE TABLE designations (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code        VARCHAR(20)  NOT NULL UNIQUE,
    name        VARCHAR(200) NOT NULL,
    grade       VARCHAR(20),
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE: system_users
-- ============================================================
CREATE TABLE system_users (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_no         VARCHAR(50)  UNIQUE,
    username            VARCHAR(100) NOT NULL UNIQUE,
    email               VARCHAR(255) NOT NULL UNIQUE,
    password_hash       TEXT NOT NULL,
    full_name           VARCHAR(300) NOT NULL,
    role                user_role NOT NULL,
    department_id       UUID REFERENCES departments(id),
    status              user_status NOT NULL DEFAULT 'active',
    last_login_at       TIMESTAMPTZ,
    failed_login_count  INTEGER NOT NULL DEFAULT 0,
    locked_at           TIMESTAMPTZ,
    password_changed_at TIMESTAMPTZ,
    must_change_pwd     BOOLEAN NOT NULL DEFAULT TRUE,
    created_by          UUID REFERENCES system_users(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE: pensioners
--
-- monthly_pension    : Exact amount paid each month. Entered at
--                      registration. Changes tracked in pension_adjustments.
-- total_gratuity_due : Total lump sum entitlement from award letter.
--                      Entered at registration. Changes tracked in
--                      gratuity_adjustments. Balance computed in view.
-- No salary, pension rate, or gratuity rate fields.
-- ============================================================
CREATE TABLE pensioners (
    id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pension_no                VARCHAR(50)  NOT NULL UNIQUE,
    employee_no               VARCHAR(50)  NOT NULL,
    title                     VARCHAR(20),
    first_name                VARCHAR(100) NOT NULL,
    middle_name               VARCHAR(100),
    last_name                 VARCHAR(100) NOT NULL,
    maiden_name               VARCHAR(100),
    gender                    gender_type  NOT NULL,
    date_of_birth             DATE NOT NULL,
    national_id               VARCHAR(50)  UNIQUE,
    passport_no               VARCHAR(50),
    nationality               VARCHAR(100) NOT NULL DEFAULT 'Malawian',
    marital_status            VARCHAR(30),
    phone_primary             VARCHAR(30),
    phone_secondary           VARCHAR(30),
    email                     VARCHAR(255),
    postal_address            TEXT,
    physical_address          TEXT,

    -- Next of kin
    next_of_kin_name          VARCHAR(300),
    next_of_kin_relation      VARCHAR(100),
    next_of_kin_phone         VARCHAR(30),
    next_of_kin_address       TEXT,

    -- Employment record (informational)
    department_id             UUID REFERENCES departments(id),
    designation_id            UUID REFERENCES designations(id),
    employment_type           employment_type NOT NULL DEFAULT 'permanent',
    date_of_first_appointment DATE NOT NULL,
    date_of_retirement        DATE,
    date_of_death             DATE,
    date_of_termination       DATE,
    reason_for_exit           TEXT,
    years_of_service          NUMERIC(6,2),  -- Informational; entered by user

    -- ── CORE FINANCIAL FIELDS (entered directly at registration) ──────────
    monthly_pension           NUMERIC(15,2) NOT NULL CHECK (monthly_pension >= 0),
    total_gratuity_due        NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (total_gratuity_due >= 0),
    -- ─────────────────────────────────────────────────────────────────────

    pension_start_date        DATE,
    pension_end_date          DATE,
    status                    pension_status NOT NULL DEFAULT 'active',

    introduced_by             UUID REFERENCES system_users(id),
    created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    notes                     TEXT
);

COMMENT ON COLUMN pensioners.monthly_pension IS
  'Exact pension amount paid each month. Entered by Creator at registration. '
  'Never computed by the system. Changes auto-logged to pension_adjustments.';

COMMENT ON COLUMN pensioners.total_gratuity_due IS
  'Total gratuity entitlement from award letter. Entered by Creator at registration. '
  'Changes auto-logged to gratuity_adjustments. Running balance in v_gratuity_balance.';

-- ============================================================
-- TABLE: pensioner_documents
-- ============================================================
CREATE TABLE pensioner_documents (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pensioner_id UUID NOT NULL REFERENCES pensioners(id) ON DELETE CASCADE,
    doc_type     document_type NOT NULL,
    file_name    VARCHAR(500) NOT NULL,
    file_path    TEXT NOT NULL,
    file_size    BIGINT,
    mime_type    VARCHAR(100),
    description  TEXT,
    uploaded_by  UUID REFERENCES system_users(id),
    uploaded_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE: bank_accounts
-- ============================================================
CREATE TABLE bank_accounts (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pensioner_id    UUID NOT NULL REFERENCES pensioners(id) ON DELETE CASCADE,
    bank_name       VARCHAR(200) NOT NULL,
    bank_code       VARCHAR(20),
    branch_name     VARCHAR(200),
    branch_code     VARCHAR(20),
    account_number  VARCHAR(100) NOT NULL,
    account_name    VARCHAR(300) NOT NULL,
    account_type    bank_account_type NOT NULL DEFAULT 'savings',
    is_primary      BOOLEAN NOT NULL DEFAULT FALSE,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    effective_from  DATE NOT NULL,
    effective_to    DATE,
    created_by      UUID REFERENCES system_users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One primary account per pensioner at any time
CREATE UNIQUE INDEX idx_bank_one_primary
    ON bank_accounts(pensioner_id)
    WHERE is_primary = TRUE AND is_active = TRUE;

-- ============================================================
-- TABLE: pension_payment_runs
--
-- One run per calendar month.
-- Auto-generated on the 14th by the scheduler, OR manually
-- created by a Creator for the same period.
-- ============================================================
CREATE TABLE pension_payment_runs (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    run_code            VARCHAR(50)   NOT NULL UNIQUE,  -- e.g. RUN-2026-03
    payment_period      VARCHAR(7)    NOT NULL,         -- YYYY-MM
    payment_month       INTEGER       NOT NULL CHECK (payment_month BETWEEN 1 AND 12),
    payment_year        INTEGER       NOT NULL CHECK (payment_year > 2000),
    scheduled_date      DATE          NOT NULL,         -- 14th of the month
    total_pensioners    INTEGER       NOT NULL DEFAULT 0,
    total_gross_amount  NUMERIC(18,2) NOT NULL DEFAULT 0,
    total_deductions    NUMERIC(18,2) NOT NULL DEFAULT 0,
    total_net_amount    NUMERIC(18,2) NOT NULL DEFAULT 0,
    status              payment_status NOT NULL DEFAULT 'pending',
    is_auto_generated   BOOLEAN       NOT NULL DEFAULT FALSE,
    description         TEXT,
    created_by          UUID REFERENCES system_users(id),
    submitted_by        UUID REFERENCES system_users(id),
    approved_by_1       UUID REFERENCES system_users(id),
    approved_by_2       UUID REFERENCES system_users(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    submitted_at        TIMESTAMPTZ,
    approved_at_1       TIMESTAMPTZ,
    approved_at_2       TIMESTAMPTZ,
    processed_at        TIMESTAMPTZ,
    notes               TEXT,
    UNIQUE(payment_month, payment_year)
);

-- ============================================================
-- TABLE: pension_payment_lines
--
-- One row per pensioner per run.
-- gross_amount = snapshot of pensioner.monthly_pension at run creation.
-- net_amount and total_deductions are generated columns.
-- ============================================================
CREATE TABLE pension_payment_lines (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    run_id           UUID NOT NULL REFERENCES pension_payment_runs(id) ON DELETE CASCADE,
    pensioner_id     UUID NOT NULL REFERENCES pensioners(id),
    bank_account_id  UUID REFERENCES bank_accounts(id),
    gross_amount     NUMERIC(15,2) NOT NULL CHECK (gross_amount >= 0),
    tax_deduction    NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (tax_deduction >= 0),
    other_deductions NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (other_deductions >= 0),
    total_deductions NUMERIC(15,2) GENERATED ALWAYS AS (tax_deduction + other_deductions) STORED,
    net_amount       NUMERIC(15,2) GENERATED ALWAYS AS (gross_amount - tax_deduction - other_deductions) STORED,
    payment_ref      VARCHAR(100),
    transaction_ref  VARCHAR(200),
    status           payment_status NOT NULL DEFAULT 'pending',
    failure_reason   TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(run_id, pensioner_id)
);

COMMENT ON COLUMN pension_payment_lines.gross_amount IS
  'Snapshot of pensioner.monthly_pension at run creation time.';

-- ============================================================
-- TABLE: gratuity_records
-- ============================================================
CREATE TABLE gratuity_records (
    id                           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    gratuity_ref                 VARCHAR(50) NOT NULL UNIQUE,
    pensioner_id                 UUID NOT NULL REFERENCES pensioners(id),
    gratuity_type                gratuity_type NOT NULL,
    claim_date                   DATE NOT NULL,
    total_gratuity_due_snapshot  NUMERIC(18,2) NOT NULL,  -- Snapshot at time of claim
    amount_requested             NUMERIC(18,2) NOT NULL CHECK (amount_requested > 0),
    is_partial                   BOOLEAN NOT NULL DEFAULT FALSE,
    partial_reason               TEXT,
    payment_date                 DATE,
    bank_account_id              UUID REFERENCES bank_accounts(id),
    payment_ref                  VARCHAR(100),
    transaction_ref              VARCHAR(200),
    beneficiary_name             VARCHAR(300),
    beneficiary_relation         VARCHAR(100),
    beneficiary_id_no            VARCHAR(50),
    beneficiary_phone            VARCHAR(30),
    status                       gratuity_status NOT NULL DEFAULT 'pending',
    created_by                   UUID REFERENCES system_users(id),
    submitted_by                 UUID REFERENCES system_users(id),
    approved_by_1                UUID REFERENCES system_users(id),
    approved_by_2                UUID REFERENCES system_users(id),
    paid_by                      UUID REFERENCES system_users(id),
    created_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    submitted_at                 TIMESTAMPTZ,
    approved_at_1                TIMESTAMPTZ,
    approved_at_2                TIMESTAMPTZ,
    paid_at                      TIMESTAMPTZ,
    notes                        TEXT,
    rejection_reason             TEXT
);

-- ============================================================
-- TABLE: arrears
-- ============================================================
CREATE TABLE arrears (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    arrear_ref      VARCHAR(50) NOT NULL UNIQUE,
    pensioner_id    UUID NOT NULL REFERENCES pensioners(id),
    arrear_type     VARCHAR(100) NOT NULL,
    description     TEXT NOT NULL,
    from_period     VARCHAR(7),
    to_period       VARCHAR(7),
    computed_amount NUMERIC(15,2) NOT NULL CHECK (computed_amount > 0),
    paid_amount     NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
    balance_amount  NUMERIC(15,2) GENERATED ALWAYS AS (computed_amount - paid_amount) STORED,
    payment_date    DATE,
    bank_account_id UUID REFERENCES bank_accounts(id),
    payment_ref     VARCHAR(100),
    transaction_ref VARCHAR(200),
    status          arrear_status NOT NULL DEFAULT 'pending',
    created_by      UUID REFERENCES system_users(id),
    approved_by     UUID REFERENCES system_users(id),
    paid_by         UUID REFERENCES system_users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    approved_at     TIMESTAMPTZ,
    paid_at         TIMESTAMPTZ,
    notes           TEXT
);

-- ============================================================
-- TABLE: pension_adjustments
-- Auto-populated by trigger when pensioners.monthly_pension changes.
-- ============================================================
CREATE TABLE pension_adjustments (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pensioner_id        UUID NOT NULL REFERENCES pensioners(id),
    effective_date      DATE NOT NULL,
    old_monthly_pension NUMERIC(15,2) NOT NULL,
    new_monthly_pension NUMERIC(15,2) NOT NULL CHECK (new_monthly_pension >= 0),
    adjustment_reason   TEXT NOT NULL,
    adjusted_by         UUID REFERENCES system_users(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE: gratuity_adjustments
-- Auto-populated by trigger when pensioners.total_gratuity_due changes.
-- ============================================================
CREATE TABLE gratuity_adjustments (
    id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pensioner_id           UUID NOT NULL REFERENCES pensioners(id),
    effective_date         DATE NOT NULL,
    old_total_gratuity_due NUMERIC(18,2) NOT NULL,
    new_total_gratuity_due NUMERIC(18,2) NOT NULL CHECK (new_total_gratuity_due >= 0),
    adjustment_reason      TEXT NOT NULL,
    adjusted_by            UUID REFERENCES system_users(id),
    created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE: death_notifications
-- ============================================================
CREATE TABLE death_notifications (
    id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pensioner_id         UUID NOT NULL REFERENCES pensioners(id),
    date_of_death        DATE NOT NULL,
    notified_by          VARCHAR(300),
    notification_date    DATE NOT NULL,
    death_cert_no        VARCHAR(100),
    has_death_cert       BOOLEAN NOT NULL DEFAULT FALSE,
    final_payment_run_id UUID REFERENCES pension_payment_runs(id),
    gratuity_id          UUID REFERENCES gratuity_records(id),
    recorded_by          UUID REFERENCES system_users(id),
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    notes                TEXT
);

-- ============================================================
-- TABLE: monthly_run_schedule
-- Scheduler log for auto-run on 14th of each month.
-- ============================================================
CREATE TABLE monthly_run_schedule (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    schedule_month INTEGER NOT NULL CHECK (schedule_month BETWEEN 1 AND 12),
    schedule_year  INTEGER NOT NULL CHECK (schedule_year > 2000),
    scheduled_date DATE NOT NULL,
    trigger_status autorun_status NOT NULL DEFAULT 'pending',
    triggered_at   TIMESTAMPTZ,
    run_id         UUID REFERENCES pension_payment_runs(id),
    error_message  TEXT,
    UNIQUE(schedule_month, schedule_year)
);

-- ============================================================
-- TABLE: workflow_audit_trail
-- ============================================================
CREATE TABLE workflow_audit_trail (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_type     VARCHAR(100) NOT NULL,
    entity_id       UUID NOT NULL,
    action          workflow_action NOT NULL,
    action_by       UUID NOT NULL REFERENCES system_users(id),
    action_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    previous_status VARCHAR(100),
    new_status      VARCHAR(100),
    remarks         TEXT,
    ip_address      INET,
    user_agent      TEXT
);

-- ============================================================
-- TABLE: notifications
-- ============================================================
CREATE TABLE notifications (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID REFERENCES system_users(id),
    title       VARCHAR(500) NOT NULL,
    body        TEXT NOT NULL,
    entity_type VARCHAR(100),
    entity_id   UUID,
    is_read     BOOLEAN NOT NULL DEFAULT FALSE,
    read_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE: system_settings
-- ============================================================
CREATE TABLE system_settings (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    setting_key   VARCHAR(200) NOT NULL UNIQUE,
    setting_value TEXT NOT NULL,
    description   TEXT,
    updated_by    UUID REFERENCES system_users(id),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE: audit_logs
-- ============================================================
CREATE TABLE audit_logs (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID REFERENCES system_users(id),
    action      VARCHAR(200) NOT NULL,
    module      VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100),
    entity_id   UUID,
    old_data    JSONB,
    new_data    JSONB,
    ip_address  INET,
    user_agent  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_pensioners_pension_no    ON pensioners(pension_no);
CREATE INDEX idx_pensioners_employee_no   ON pensioners(employee_no);
CREATE INDEX idx_pensioners_status        ON pensioners(status);
CREATE INDEX idx_pensioners_department    ON pensioners(department_id);
CREATE INDEX idx_pensioners_designation   ON pensioners(designation_id);
CREATE INDEX idx_pensioners_name          ON pensioners(last_name, first_name);
CREATE INDEX idx_pensioners_introduced    ON pensioners(introduced_by);
CREATE INDEX idx_pensioners_created_at    ON pensioners(created_at);

CREATE INDEX idx_payment_runs_period      ON pension_payment_runs(payment_year, payment_month);
CREATE INDEX idx_payment_runs_status      ON pension_payment_runs(status);
CREATE INDEX idx_payment_runs_scheduled   ON pension_payment_runs(scheduled_date);

CREATE INDEX idx_payment_lines_run        ON pension_payment_lines(run_id);
CREATE INDEX idx_payment_lines_pensioner  ON pension_payment_lines(pensioner_id);
CREATE INDEX idx_payment_lines_status     ON pension_payment_lines(status);

CREATE INDEX idx_gratuity_pensioner       ON gratuity_records(pensioner_id);
CREATE INDEX idx_gratuity_status          ON gratuity_records(status);
CREATE INDEX idx_gratuity_type            ON gratuity_records(gratuity_type);
CREATE INDEX idx_gratuity_partial         ON gratuity_records(is_partial) WHERE is_partial = TRUE;

CREATE INDEX idx_arrears_pensioner        ON arrears(pensioner_id);
CREATE INDEX idx_arrears_status           ON arrears(status);

CREATE INDEX idx_pension_adj_pensioner    ON pension_adjustments(pensioner_id);
CREATE INDEX idx_gratuity_adj_pensioner   ON gratuity_adjustments(pensioner_id);

CREATE INDEX idx_workflow_entity          ON workflow_audit_trail(entity_type, entity_id);
CREATE INDEX idx_workflow_action_by       ON workflow_audit_trail(action_by);
CREATE INDEX idx_audit_logs_user          ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_created       ON audit_logs(created_at);
CREATE INDEX idx_notifications_user       ON notifications(user_id, is_read);

-- ============================================================
-- VIEWS
-- ============================================================

-- Active pensioners
CREATE OR REPLACE VIEW v_active_pensioners AS
SELECT
    p.id, p.pension_no, p.employee_no,
    TRIM(CONCAT_WS(' ', p.title, p.first_name, p.middle_name, p.last_name)) AS full_name,
    p.gender,
    p.date_of_birth,
    DATE_PART('year', AGE(p.date_of_birth))::INTEGER AS age,
    d.name  AS department_name,
    ds.name AS designation_name,
    ds.grade,
    p.date_of_first_appointment,
    p.date_of_retirement,
    p.years_of_service,
    p.monthly_pension,
    p.total_gratuity_due,
    p.pension_start_date,
    p.status,
    p.phone_primary, p.email,
    su.full_name AS introduced_by_name,
    p.created_at AS introduced_date
FROM pensioners p
LEFT JOIN departments  d  ON p.department_id  = d.id
LEFT JOIN designations ds ON p.designation_id = ds.id
LEFT JOIN system_users su ON p.introduced_by  = su.id
WHERE p.status = 'active';

-- Gratuity balance per pensioner
CREATE OR REPLACE VIEW v_gratuity_balance AS
SELECT
    p.id          AS pensioner_id,
    p.pension_no,
    p.employee_no,
    TRIM(CONCAT_WS(' ', p.first_name, p.last_name)) AS full_name,
    d.name        AS department_name,
    p.total_gratuity_due,
    COALESCE(paid.total_paid,    0)                           AS total_gratuity_paid,
    p.total_gratuity_due - COALESCE(paid.total_paid, 0)       AS gratuity_balance_remaining,
    COALESCE(paid.partial_count, 0)                           AS partial_payments_count,
    COALESCE(paid.full_count,    0)                           AS full_payments_count,
    paid.first_paid_date,
    paid.last_paid_date
FROM pensioners p
LEFT JOIN departments d ON p.department_id = d.id
LEFT JOIN (
    SELECT
        pensioner_id,
        SUM(amount_requested)                                            AS total_paid,
        COUNT(*) FILTER (WHERE is_partial = TRUE  AND status = 'paid')  AS partial_count,
        COUNT(*) FILTER (WHERE is_partial = FALSE AND status = 'paid')  AS full_count,
        MIN(paid_at)::DATE                                               AS first_paid_date,
        MAX(paid_at)::DATE                                               AS last_paid_date
    FROM gratuity_records
    WHERE status = 'paid'
    GROUP BY pensioner_id
) paid ON paid.pensioner_id = p.id;

-- Outstanding gratuity (balance > 0)
CREATE OR REPLACE VIEW v_gratuity_due AS
SELECT * FROM v_gratuity_balance
WHERE gratuity_balance_remaining > 0
ORDER BY gratuity_balance_remaining DESC;

-- Partial gratuity recipients
CREATE OR REPLACE VIEW v_partial_gratuity_recipients AS
SELECT
    gb.*,
    gr_list.partial_amounts,
    gr_list.partial_dates
FROM v_gratuity_balance gb
JOIN (
    SELECT
        pensioner_id,
        STRING_AGG(amount_requested::TEXT, ', ' ORDER BY paid_at) AS partial_amounts,
        STRING_AGG(paid_at::DATE::TEXT,    ', ' ORDER BY paid_at) AS partial_dates
    FROM gratuity_records
    WHERE is_partial = TRUE AND status = 'paid'
    GROUP BY pensioner_id
) gr_list ON gr_list.pensioner_id = gb.pensioner_id
WHERE gb.partial_payments_count > 0;

-- Payment run summary
CREATE OR REPLACE VIEW v_payment_run_summary AS
SELECT
    pr.id, pr.run_code, pr.payment_period,
    pr.payment_month, pr.payment_year, pr.scheduled_date,
    pr.total_pensioners, pr.total_gross_amount,
    pr.total_deductions, pr.total_net_amount,
    pr.status, pr.is_auto_generated,
    u1.full_name AS created_by_name,
    u2.full_name AS approved_by_1_name,
    u3.full_name AS approved_by_2_name,
    pr.created_at, pr.approved_at_1, pr.approved_at_2, pr.processed_at
FROM pension_payment_runs pr
LEFT JOIN system_users u1 ON pr.created_by   = u1.id
LEFT JOIN system_users u2 ON pr.approved_by_1 = u2.id
LEFT JOIN system_users u3 ON pr.approved_by_2 = u3.id;

-- ============================================================
-- TRIGGERS
-- ============================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

CREATE TRIGGER trg_pensioners_updated_at    BEFORE UPDATE ON pensioners          FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_system_users_updated_at  BEFORE UPDATE ON system_users        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_payment_runs_updated_at  BEFORE UPDATE ON pension_payment_runs FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_payment_lines_updated_at BEFORE UPDATE ON pension_payment_lines FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_bank_accounts_updated_at BEFORE UPDATE ON bank_accounts        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_departments_updated_at   BEFORE UPDATE ON departments          FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_designations_updated_at  BEFORE UPDATE ON designations         FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Auto-refresh run totals
CREATE OR REPLACE FUNCTION update_run_totals()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    UPDATE pension_payment_runs SET
        total_pensioners   = (SELECT COUNT(*)                        FROM pension_payment_lines WHERE run_id = NEW.run_id),
        total_gross_amount = (SELECT COALESCE(SUM(gross_amount),  0) FROM pension_payment_lines WHERE run_id = NEW.run_id),
        total_deductions   = (SELECT COALESCE(SUM(total_deductions),0) FROM pension_payment_lines WHERE run_id = NEW.run_id),
        total_net_amount   = (SELECT COALESCE(SUM(net_amount),    0) FROM pension_payment_lines WHERE run_id = NEW.run_id)
    WHERE id = NEW.run_id;
    RETURN NEW;
END; $$;

CREATE TRIGGER trg_update_run_totals
    AFTER INSERT OR UPDATE ON pension_payment_lines
    FOR EACH ROW EXECUTE FUNCTION update_run_totals();

-- Prevent gratuity overpayment
CREATE OR REPLACE FUNCTION check_gratuity_limit()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_entitlement  NUMERIC(18,2);
    v_already_paid NUMERIC(18,2);
    v_balance      NUMERIC(18,2);
BEGIN
    SELECT total_gratuity_due INTO v_entitlement FROM pensioners WHERE id = NEW.pensioner_id;
    SELECT COALESCE(SUM(amount_requested), 0) INTO v_already_paid
    FROM gratuity_records
    WHERE pensioner_id = NEW.pensioner_id AND status = 'paid' AND id <> NEW.id;
    v_balance := v_entitlement - v_already_paid;
    IF NEW.amount_requested > v_balance THEN
        RAISE EXCEPTION 'Gratuity requested (%) exceeds remaining balance (%).', NEW.amount_requested, v_balance;
    END IF;
    NEW.total_gratuity_due_snapshot := v_entitlement;
    RETURN NEW;
END; $$;

CREATE TRIGGER trg_check_gratuity
    BEFORE INSERT OR UPDATE ON gratuity_records
    FOR EACH ROW EXECUTE FUNCTION check_gratuity_limit();

-- Auto-log pension amount changes
CREATE OR REPLACE FUNCTION log_pension_adjustment()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.monthly_pension <> OLD.monthly_pension THEN
        INSERT INTO pension_adjustments
            (pensioner_id, effective_date, old_monthly_pension, new_monthly_pension, adjustment_reason)
        VALUES (NEW.id, CURRENT_DATE, OLD.monthly_pension, NEW.monthly_pension, 'Updated via pensioner record');
    END IF;
    RETURN NEW;
END; $$;

CREATE TRIGGER trg_log_pension_adj
    AFTER UPDATE OF monthly_pension ON pensioners
    FOR EACH ROW EXECUTE FUNCTION log_pension_adjustment();

-- Auto-log gratuity entitlement changes
CREATE OR REPLACE FUNCTION log_gratuity_adjustment()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.total_gratuity_due <> OLD.total_gratuity_due THEN
        INSERT INTO gratuity_adjustments
            (pensioner_id, effective_date, old_total_gratuity_due, new_total_gratuity_due, adjustment_reason)
        VALUES (NEW.id, CURRENT_DATE, OLD.total_gratuity_due, NEW.total_gratuity_due, 'Updated via pensioner record');
    END IF;
    RETURN NEW;
END; $$;

CREATE TRIGGER trg_log_gratuity_adj
    AFTER UPDATE OF total_gratuity_due ON pensioners
    FOR EACH ROW EXECUTE FUNCTION log_gratuity_adjustment();

-- Auto-set status to deceased when date_of_death is recorded
CREATE OR REPLACE FUNCTION sync_death_status()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.date_of_death IS NOT NULL AND OLD.date_of_death IS NULL THEN
        NEW.status := 'deceased';
    END IF;
    RETURN NEW;
END; $$;

CREATE TRIGGER trg_sync_death_status
    BEFORE UPDATE OF date_of_death ON pensioners
    FOR EACH ROW EXECUTE FUNCTION sync_death_status();

-- ============================================================
-- STORED PROCEDURE: generate_monthly_payment_run
-- Called by app scheduler on the 14th of each month.
-- Creates a run and inserts lines for all active pensioners.
-- ============================================================
CREATE OR REPLACE PROCEDURE generate_monthly_payment_run(
    p_month   INTEGER,
    p_year    INTEGER,
    p_user_id UUID DEFAULT NULL
)
LANGUAGE plpgsql AS $$
DECLARE
    v_run_id     UUID;
    v_run_code   VARCHAR(50);
    v_sched_date DATE;
    v_count      INTEGER;
BEGIN
    -- Idempotency: skip if run already exists for this period
    IF EXISTS (SELECT 1 FROM pension_payment_runs WHERE payment_month = p_month AND payment_year = p_year) THEN
        RAISE NOTICE 'Run for %/% already exists. Skipping.', p_month, p_year;
        RETURN;
    END IF;

    v_run_code   := 'RUN-' || p_year || '-' || LPAD(p_month::TEXT, 2, '0');
    v_sched_date := MAKE_DATE(p_year, p_month, 14);

    INSERT INTO pension_payment_runs
        (run_code, payment_period, payment_month, payment_year, scheduled_date,
         status, is_auto_generated, created_by, description)
    VALUES
        (v_run_code,
         p_year::TEXT || '-' || LPAD(p_month::TEXT, 2, '0'),
         p_month, p_year, v_sched_date,
         'pending', (p_user_id IS NULL), p_user_id,
         'Monthly pension payment run — ' || TO_CHAR(v_sched_date, 'Month YYYY'))
    RETURNING id INTO v_run_id;

    -- One line per active pensioner, snapshotting their monthly_pension
    INSERT INTO pension_payment_lines (run_id, pensioner_id, bank_account_id, gross_amount, status)
    SELECT
        v_run_id,
        p.id,
        ba.id,
        p.monthly_pension,   -- Snapshot; not recalculated later
        'pending'
    FROM pensioners p
    LEFT JOIN bank_accounts ba
           ON ba.pensioner_id = p.id AND ba.is_primary = TRUE AND ba.is_active = TRUE
    WHERE p.status = 'active';

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE 'Run % created: % lines.', v_run_code, v_count;
END; $$;

-- ============================================================
-- DEFAULT SYSTEM SETTINGS
-- ============================================================
INSERT INTO system_settings (setting_key, setting_value, description) VALUES
('system.org_name',               'Government of Malawi',    'Organisation name'),
('system.system_name',            'National Pension System', 'System display name'),
('system.fiscal_year_start',      '07',                      'Fiscal year start month (07 = July)'),
('payment.currency',              'MWK',                     'Payment currency code'),
('payment.currency_symbol',       'K',                       'Currency symbol for display'),
('payment.auto_run_day',          '14',                      'Day of month for auto payment run generation'),
('payment.tax_threshold',         '100000',                  'Monthly pension above which PAYE applies (MWK)'),
('payment.tax_rate',              '0.10',                    'PAYE tax rate applied above threshold'),
('approval.require_two_approvals','true',                    'Require two approvals before processing'),
('account.max_failed_logins',     '5',                       'Consecutive failures before account lock'),
('account.session_hours',         '8',                       'JWT access token validity in hours')
ON CONFLICT (setting_key) DO NOTHING;

-- ============================================================
-- END OF SCHEMA
-- ============================================================

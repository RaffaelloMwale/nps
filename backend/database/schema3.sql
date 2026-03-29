--
-- PostgreSQL database dump
--

-- Dumped from database version 17.1
-- Dumped by pg_dump version 17.1

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: nps; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA nps;


ALTER SCHEMA nps OWNER TO postgres;

--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: arrear_status; Type: TYPE; Schema: nps; Owner: postgres
--

CREATE TYPE nps.arrear_status AS ENUM (
    'pending',
    'approved',
    'paid',
    'cancelled'
);


ALTER TYPE nps.arrear_status OWNER TO postgres;

--
-- Name: autorun_status; Type: TYPE; Schema: nps; Owner: postgres
--

CREATE TYPE nps.autorun_status AS ENUM (
    'pending',
    'triggered',
    'skipped',
    'failed'
);


ALTER TYPE nps.autorun_status OWNER TO postgres;

--
-- Name: bank_account_type; Type: TYPE; Schema: nps; Owner: postgres
--

CREATE TYPE nps.bank_account_type AS ENUM (
    'savings',
    'current',
    'mobile_money'
);


ALTER TYPE nps.bank_account_type OWNER TO postgres;

--
-- Name: document_type; Type: TYPE; Schema: nps; Owner: postgres
--

CREATE TYPE nps.document_type AS ENUM (
    'national_id',
    'passport',
    'birth_certificate',
    'death_certificate',
    'appointment_letter',
    'pension_award_letter',
    'gratuity_award_letter',
    'bank_confirmation',
    'other'
);


ALTER TYPE nps.document_type OWNER TO postgres;

--
-- Name: employment_type; Type: TYPE; Schema: nps; Owner: postgres
--

CREATE TYPE nps.employment_type AS ENUM (
    'permanent',
    'contract',
    'casual'
);


ALTER TYPE nps.employment_type OWNER TO postgres;

--
-- Name: gender_type; Type: TYPE; Schema: nps; Owner: postgres
--

CREATE TYPE nps.gender_type AS ENUM (
    'male',
    'female',
    'other'
);


ALTER TYPE nps.gender_type OWNER TO postgres;

--
-- Name: gratuity_status; Type: TYPE; Schema: nps; Owner: postgres
--

CREATE TYPE nps.gratuity_status AS ENUM (
    'pending',
    'submitted',
    'approved_1',
    'approved_2',
    'paid',
    'rejected'
);


ALTER TYPE nps.gratuity_status OWNER TO postgres;

--
-- Name: gratuity_type; Type: TYPE; Schema: nps; Owner: postgres
--

CREATE TYPE nps.gratuity_type AS ENUM (
    'full',
    'partial',
    'death'
);


ALTER TYPE nps.gratuity_type OWNER TO postgres;

--
-- Name: payment_status; Type: TYPE; Schema: nps; Owner: postgres
--

CREATE TYPE nps.payment_status AS ENUM (
    'pending',
    'submitted',
    'approved_1',
    'approved_2',
    'processed',
    'failed',
    'reversed'
);


ALTER TYPE nps.payment_status OWNER TO postgres;

--
-- Name: pension_status; Type: TYPE; Schema: nps; Owner: postgres
--

CREATE TYPE nps.pension_status AS ENUM (
    'active',
    'suspended',
    'terminated',
    'deceased'
);


ALTER TYPE nps.pension_status OWNER TO postgres;

--
-- Name: user_role; Type: TYPE; Schema: nps; Owner: postgres
--

CREATE TYPE nps.user_role AS ENUM (
    'admin',
    'creator',
    'approver_1',
    'approver_2'
);


ALTER TYPE nps.user_role OWNER TO postgres;

--
-- Name: user_status; Type: TYPE; Schema: nps; Owner: postgres
--

CREATE TYPE nps.user_status AS ENUM (
    'active',
    'inactive',
    'suspended'
);


ALTER TYPE nps.user_status OWNER TO postgres;

--
-- Name: workflow_action; Type: TYPE; Schema: nps; Owner: postgres
--

CREATE TYPE nps.workflow_action AS ENUM (
    'created',
    'submitted',
    'approved_1',
    'approved_2',
    'rejected',
    'reversed',
    'paid',
    'cancelled'
);


ALTER TYPE nps.workflow_action OWNER TO postgres;

--
-- Name: check_gratuity_limit(); Type: FUNCTION; Schema: nps; Owner: postgres
--

CREATE FUNCTION nps.check_gratuity_limit() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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


ALTER FUNCTION nps.check_gratuity_limit() OWNER TO postgres;

--
-- Name: generate_monthly_payment_run(integer, integer, uuid); Type: PROCEDURE; Schema: nps; Owner: postgres
--

CREATE PROCEDURE nps.generate_monthly_payment_run(IN p_month integer, IN p_year integer, IN p_user_id uuid DEFAULT NULL::uuid)
    LANGUAGE plpgsql
    AS $$
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
         'Monthly pension payment run â€” ' || TO_CHAR(v_sched_date, 'Month YYYY'))
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


ALTER PROCEDURE nps.generate_monthly_payment_run(IN p_month integer, IN p_year integer, IN p_user_id uuid) OWNER TO postgres;

--
-- Name: log_gratuity_adjustment(); Type: FUNCTION; Schema: nps; Owner: postgres
--

CREATE FUNCTION nps.log_gratuity_adjustment() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.total_gratuity_due <> OLD.total_gratuity_due THEN
        INSERT INTO gratuity_adjustments
            (pensioner_id, effective_date, old_total_gratuity_due, new_total_gratuity_due, adjustment_reason)
        VALUES (NEW.id, CURRENT_DATE, OLD.total_gratuity_due, NEW.total_gratuity_due, 'Updated via pensioner record');
    END IF;
    RETURN NEW;
END; $$;


ALTER FUNCTION nps.log_gratuity_adjustment() OWNER TO postgres;

--
-- Name: log_pension_adjustment(); Type: FUNCTION; Schema: nps; Owner: postgres
--

CREATE FUNCTION nps.log_pension_adjustment() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.monthly_pension <> OLD.monthly_pension THEN
        INSERT INTO pension_adjustments
            (pensioner_id, effective_date, old_monthly_pension, new_monthly_pension, adjustment_reason)
        VALUES (NEW.id, CURRENT_DATE, OLD.monthly_pension, NEW.monthly_pension, 'Updated via pensioner record');
    END IF;
    RETURN NEW;
END; $$;


ALTER FUNCTION nps.log_pension_adjustment() OWNER TO postgres;

--
-- Name: set_gratuity_updated_at(); Type: FUNCTION; Schema: nps; Owner: postgres
--

CREATE FUNCTION nps.set_gratuity_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;


ALTER FUNCTION nps.set_gratuity_updated_at() OWNER TO postgres;

--
-- Name: set_updated_at(); Type: FUNCTION; Schema: nps; Owner: postgres
--

CREATE FUNCTION nps.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;


ALTER FUNCTION nps.set_updated_at() OWNER TO postgres;

--
-- Name: sync_death_status(); Type: FUNCTION; Schema: nps; Owner: postgres
--

CREATE FUNCTION nps.sync_death_status() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.date_of_death IS NOT NULL AND OLD.date_of_death IS NULL THEN
        NEW.status := 'deceased';
    END IF;
    RETURN NEW;
END; $$;


ALTER FUNCTION nps.sync_death_status() OWNER TO postgres;

--
-- Name: update_run_totals(); Type: FUNCTION; Schema: nps; Owner: postgres
--

CREATE FUNCTION nps.update_run_totals() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    UPDATE pension_payment_runs SET
        total_pensioners   = (SELECT COUNT(*)                        FROM pension_payment_lines WHERE run_id = NEW.run_id),
        total_gross_amount = (SELECT COALESCE(SUM(gross_amount),  0) FROM pension_payment_lines WHERE run_id = NEW.run_id),
        total_deductions   = (SELECT COALESCE(SUM(total_deductions),0) FROM pension_payment_lines WHERE run_id = NEW.run_id),
        total_net_amount   = (SELECT COALESCE(SUM(net_amount),    0) FROM pension_payment_lines WHERE run_id = NEW.run_id)
    WHERE id = NEW.run_id;
    RETURN NEW;
END; $$;


ALTER FUNCTION nps.update_run_totals() OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: arrears; Type: TABLE; Schema: nps; Owner: postgres
--

CREATE TABLE nps.arrears (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    arrear_ref character varying(50) NOT NULL,
    pensioner_id uuid NOT NULL,
    arrear_type character varying(100) NOT NULL,
    description text NOT NULL,
    from_period character varying(7),
    to_period character varying(7),
    computed_amount numeric(15,2) NOT NULL,
    paid_amount numeric(15,2) DEFAULT 0 NOT NULL,
    balance_amount numeric(15,2) GENERATED ALWAYS AS ((computed_amount - paid_amount)) STORED,
    payment_date date,
    bank_account_id uuid,
    payment_ref character varying(100),
    transaction_ref character varying(200),
    status nps.arrear_status DEFAULT 'pending'::nps.arrear_status NOT NULL,
    created_by uuid,
    approved_by uuid,
    paid_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    approved_at timestamp with time zone,
    paid_at timestamp with time zone,
    notes text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT arrears_computed_amount_check CHECK ((computed_amount > (0)::numeric)),
    CONSTRAINT arrears_paid_amount_check CHECK ((paid_amount >= (0)::numeric))
);


ALTER TABLE nps.arrears OWNER TO postgres;

--
-- Name: audit_logs; Type: TABLE; Schema: nps; Owner: postgres
--

CREATE TABLE nps.audit_logs (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid,
    action character varying(200) NOT NULL,
    module character varying(100) NOT NULL,
    entity_type character varying(100),
    entity_id uuid,
    old_data jsonb,
    new_data jsonb,
    ip_address inet,
    user_agent text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE nps.audit_logs OWNER TO postgres;

--
-- Name: bank_accounts; Type: TABLE; Schema: nps; Owner: postgres
--

CREATE TABLE nps.bank_accounts (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    pensioner_id uuid NOT NULL,
    bank_name character varying(200) NOT NULL,
    bank_code character varying(20),
    branch_name character varying(200),
    branch_code character varying(20),
    account_number character varying(100) NOT NULL,
    account_name character varying(300) NOT NULL,
    account_type nps.bank_account_type DEFAULT 'savings'::nps.bank_account_type NOT NULL,
    is_primary boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    effective_from date NOT NULL,
    effective_to date,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE nps.bank_accounts OWNER TO postgres;

--
-- Name: death_notifications; Type: TABLE; Schema: nps; Owner: postgres
--

CREATE TABLE nps.death_notifications (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    pensioner_id uuid NOT NULL,
    date_of_death date NOT NULL,
    notified_by character varying(300),
    notification_date date NOT NULL,
    death_cert_no character varying(100),
    has_death_cert boolean DEFAULT false NOT NULL,
    final_payment_run_id uuid,
    gratuity_id uuid,
    recorded_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    notes text
);


ALTER TABLE nps.death_notifications OWNER TO postgres;

--
-- Name: departments; Type: TABLE; Schema: nps; Owner: postgres
--

CREATE TABLE nps.departments (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    code character varying(20) NOT NULL,
    name character varying(200) NOT NULL,
    description text,
    parent_id uuid,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE nps.departments OWNER TO postgres;

--
-- Name: designations; Type: TABLE; Schema: nps; Owner: postgres
--

CREATE TABLE nps.designations (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    code character varying(20) NOT NULL,
    name character varying(200) NOT NULL,
    grade character varying(20),
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE nps.designations OWNER TO postgres;

--
-- Name: gratuity_adjustments; Type: TABLE; Schema: nps; Owner: postgres
--

CREATE TABLE nps.gratuity_adjustments (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    pensioner_id uuid NOT NULL,
    effective_date date NOT NULL,
    old_total_gratuity_due numeric(18,2) NOT NULL,
    new_total_gratuity_due numeric(18,2) NOT NULL,
    adjustment_reason text NOT NULL,
    adjusted_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT gratuity_adjustments_new_total_gratuity_due_check CHECK ((new_total_gratuity_due >= (0)::numeric))
);


ALTER TABLE nps.gratuity_adjustments OWNER TO postgres;

--
-- Name: gratuity_records; Type: TABLE; Schema: nps; Owner: postgres
--

CREATE TABLE nps.gratuity_records (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    gratuity_ref character varying(50) NOT NULL,
    pensioner_id uuid NOT NULL,
    gratuity_type nps.gratuity_type NOT NULL,
    claim_date date NOT NULL,
    total_gratuity_due_snapshot numeric(18,2) NOT NULL,
    amount_requested numeric(18,2) NOT NULL,
    is_partial boolean DEFAULT false NOT NULL,
    partial_reason text,
    payment_date date,
    bank_account_id uuid,
    payment_ref character varying(100),
    transaction_ref character varying(200),
    beneficiary_name character varying(300),
    beneficiary_relation character varying(100),
    beneficiary_id_no character varying(50),
    beneficiary_phone character varying(30),
    status nps.gratuity_status DEFAULT 'pending'::nps.gratuity_status NOT NULL,
    created_by uuid,
    submitted_by uuid,
    approved_by_1 uuid,
    approved_by_2 uuid,
    paid_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    submitted_at timestamp with time zone,
    approved_at_1 timestamp with time zone,
    approved_at_2 timestamp with time zone,
    paid_at timestamp with time zone,
    notes text,
    rejection_reason text,
    ifmis_trf_number character varying(100),
    gratuity_received boolean DEFAULT false NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT gratuity_records_amount_requested_check CHECK ((amount_requested > (0)::numeric))
);


ALTER TABLE nps.gratuity_records OWNER TO postgres;

--
-- Name: COLUMN gratuity_records.ifmis_trf_number; Type: COMMENT; Schema: nps; Owner: postgres
--

COMMENT ON COLUMN nps.gratuity_records.ifmis_trf_number IS 'IFMIS Transfer Reference Number recorded when payment is confirmed.';


--
-- Name: COLUMN gratuity_records.gratuity_received; Type: COMMENT; Schema: nps; Owner: postgres
--

COMMENT ON COLUMN nps.gratuity_records.gratuity_received IS 'TRUE when the pensioner/beneficiary has confirmed receipt of the gratuity payment.';


--
-- Name: monthly_run_schedule; Type: TABLE; Schema: nps; Owner: postgres
--

CREATE TABLE nps.monthly_run_schedule (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    schedule_month integer NOT NULL,
    schedule_year integer NOT NULL,
    scheduled_date date NOT NULL,
    trigger_status nps.autorun_status DEFAULT 'pending'::nps.autorun_status NOT NULL,
    triggered_at timestamp with time zone,
    run_id uuid,
    error_message text,
    CONSTRAINT monthly_run_schedule_schedule_month_check CHECK (((schedule_month >= 1) AND (schedule_month <= 12))),
    CONSTRAINT monthly_run_schedule_schedule_year_check CHECK ((schedule_year > 2000))
);


ALTER TABLE nps.monthly_run_schedule OWNER TO postgres;

--
-- Name: notifications; Type: TABLE; Schema: nps; Owner: postgres
--

CREATE TABLE nps.notifications (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid,
    title character varying(500) NOT NULL,
    body text NOT NULL,
    entity_type character varying(100),
    entity_id uuid,
    is_read boolean DEFAULT false NOT NULL,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE nps.notifications OWNER TO postgres;

--
-- Name: pension_adjustments; Type: TABLE; Schema: nps; Owner: postgres
--

CREATE TABLE nps.pension_adjustments (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    pensioner_id uuid NOT NULL,
    effective_date date NOT NULL,
    old_monthly_pension numeric(15,2) NOT NULL,
    new_monthly_pension numeric(15,2) NOT NULL,
    adjustment_reason text NOT NULL,
    adjusted_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT pension_adjustments_new_monthly_pension_check CHECK ((new_monthly_pension >= (0)::numeric))
);


ALTER TABLE nps.pension_adjustments OWNER TO postgres;

--
-- Name: pension_payment_lines; Type: TABLE; Schema: nps; Owner: postgres
--

CREATE TABLE nps.pension_payment_lines (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    run_id uuid NOT NULL,
    pensioner_id uuid NOT NULL,
    bank_account_id uuid,
    gross_amount numeric(15,2) NOT NULL,
    tax_deduction numeric(15,2) DEFAULT 0 NOT NULL,
    other_deductions numeric(15,2) DEFAULT 0 NOT NULL,
    total_deductions numeric(15,2) GENERATED ALWAYS AS ((tax_deduction + other_deductions)) STORED,
    net_amount numeric(15,2) GENERATED ALWAYS AS (((gross_amount - tax_deduction) - other_deductions)) STORED,
    payment_ref character varying(100),
    transaction_ref character varying(200),
    status nps.payment_status DEFAULT 'pending'::nps.payment_status NOT NULL,
    failure_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT pension_payment_lines_gross_amount_check CHECK ((gross_amount >= (0)::numeric)),
    CONSTRAINT pension_payment_lines_other_deductions_check CHECK ((other_deductions >= (0)::numeric)),
    CONSTRAINT pension_payment_lines_tax_deduction_check CHECK ((tax_deduction >= (0)::numeric))
);


ALTER TABLE nps.pension_payment_lines OWNER TO postgres;

--
-- Name: COLUMN pension_payment_lines.gross_amount; Type: COMMENT; Schema: nps; Owner: postgres
--

COMMENT ON COLUMN nps.pension_payment_lines.gross_amount IS 'Snapshot of pensioner.monthly_pension at run creation time.';


--
-- Name: pension_payment_runs; Type: TABLE; Schema: nps; Owner: postgres
--

CREATE TABLE nps.pension_payment_runs (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    run_code character varying(50) NOT NULL,
    payment_period character varying(7) NOT NULL,
    payment_month integer NOT NULL,
    payment_year integer NOT NULL,
    scheduled_date date NOT NULL,
    total_pensioners integer DEFAULT 0 NOT NULL,
    total_gross_amount numeric(18,2) DEFAULT 0 NOT NULL,
    total_deductions numeric(18,2) DEFAULT 0 NOT NULL,
    total_net_amount numeric(18,2) DEFAULT 0 NOT NULL,
    status nps.payment_status DEFAULT 'pending'::nps.payment_status NOT NULL,
    is_auto_generated boolean DEFAULT false NOT NULL,
    description text,
    created_by uuid,
    submitted_by uuid,
    approved_by_1 uuid,
    approved_by_2 uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    submitted_at timestamp with time zone,
    approved_at_1 timestamp with time zone,
    approved_at_2 timestamp with time zone,
    processed_at timestamp with time zone,
    notes text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT pension_payment_runs_payment_month_check CHECK (((payment_month >= 1) AND (payment_month <= 12))),
    CONSTRAINT pension_payment_runs_payment_year_check CHECK ((payment_year > 2000))
);


ALTER TABLE nps.pension_payment_runs OWNER TO postgres;

--
-- Name: pensioner_documents; Type: TABLE; Schema: nps; Owner: postgres
--

CREATE TABLE nps.pensioner_documents (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    pensioner_id uuid NOT NULL,
    doc_type nps.document_type NOT NULL,
    file_name character varying(500) NOT NULL,
    file_path text NOT NULL,
    file_size bigint,
    mime_type character varying(100),
    description text,
    uploaded_by uuid,
    uploaded_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE nps.pensioner_documents OWNER TO postgres;

--
-- Name: pensioners; Type: TABLE; Schema: nps; Owner: postgres
--

CREATE TABLE nps.pensioners (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    pension_no character varying(50) NOT NULL,
    employee_no character varying(50) NOT NULL,
    title character varying(20),
    first_name character varying(100) NOT NULL,
    middle_name character varying(100),
    last_name character varying(100) NOT NULL,
    maiden_name character varying(100),
    gender nps.gender_type NOT NULL,
    date_of_birth date NOT NULL,
    national_id character varying(50),
    passport_no character varying(50),
    nationality character varying(100) DEFAULT 'Malawian'::character varying NOT NULL,
    marital_status character varying(30),
    phone_primary character varying(30),
    phone_secondary character varying(30),
    email character varying(255),
    postal_address text,
    physical_address text,
    next_of_kin_name character varying(300),
    next_of_kin_relation character varying(100),
    next_of_kin_phone character varying(30),
    next_of_kin_address text,
    department_id uuid,
    designation_id uuid,
    employment_type nps.employment_type DEFAULT 'permanent'::nps.employment_type NOT NULL,
    date_of_first_appointment date NOT NULL,
    date_of_retirement date,
    date_of_death date,
    date_of_termination date,
    reason_for_exit text,
    years_of_service numeric(6,2),
    monthly_pension numeric(15,2) NOT NULL,
    total_gratuity_due numeric(18,2) DEFAULT 0 NOT NULL,
    pension_start_date date,
    pension_end_date date,
    status nps.pension_status DEFAULT 'active'::nps.pension_status NOT NULL,
    introduced_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    notes text,
    designation_at_retirement character varying(200),
    grade_at_retirement character varying(20),
    grade_at_first_appointment character varying(20),
    deceased_on_entry boolean DEFAULT false NOT NULL,
    department_text character varying(300),
    pre_retirement_gratuity_paid numeric(18,2) DEFAULT 0 NOT NULL,
    pre_retirement_gratuity_reason text,
    CONSTRAINT pensioners_monthly_pension_check CHECK ((monthly_pension >= (0)::numeric)),
    CONSTRAINT pensioners_total_gratuity_due_check CHECK ((total_gratuity_due >= (0)::numeric))
);


ALTER TABLE nps.pensioners OWNER TO postgres;

--
-- Name: COLUMN pensioners.monthly_pension; Type: COMMENT; Schema: nps; Owner: postgres
--

COMMENT ON COLUMN nps.pensioners.monthly_pension IS 'Exact pension amount paid each month. Entered by Creator at registration. Never computed by the system. Changes auto-logged to pension_adjustments.';


--
-- Name: COLUMN pensioners.total_gratuity_due; Type: COMMENT; Schema: nps; Owner: postgres
--

COMMENT ON COLUMN nps.pensioners.total_gratuity_due IS 'Total gratuity entitlement from award letter. Entered by Creator at registration. Changes auto-logged to gratuity_adjustments. Running balance in v_gratuity_balance.';


--
-- Name: COLUMN pensioners.pre_retirement_gratuity_paid; Type: COMMENT; Schema: nps; Owner: postgres
--

COMMENT ON COLUMN nps.pensioners.pre_retirement_gratuity_paid IS 'Amount of gratuity paid to the officer BEFORE retirement (pre-retirement partial).
   This is deducted from total_gratuity_due to arrive at the net outstanding balance.';


--
-- Name: system_settings; Type: TABLE; Schema: nps; Owner: postgres
--

CREATE TABLE nps.system_settings (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    setting_key character varying(200) NOT NULL,
    setting_value text NOT NULL,
    description text,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE nps.system_settings OWNER TO postgres;

--
-- Name: system_users; Type: TABLE; Schema: nps; Owner: postgres
--

CREATE TABLE nps.system_users (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    employee_no character varying(50),
    username character varying(100) NOT NULL,
    email character varying(255) NOT NULL,
    password_hash text NOT NULL,
    full_name character varying(300) NOT NULL,
    role nps.user_role NOT NULL,
    department_id uuid,
    status nps.user_status DEFAULT 'active'::nps.user_status NOT NULL,
    last_login_at timestamp with time zone,
    failed_login_count integer DEFAULT 0 NOT NULL,
    locked_at timestamp with time zone,
    password_changed_at timestamp with time zone,
    must_change_pwd boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    session_token character varying(64)
);


ALTER TABLE nps.system_users OWNER TO postgres;

--
-- Name: v_active_pensioners; Type: VIEW; Schema: nps; Owner: postgres
--

CREATE VIEW nps.v_active_pensioners AS
 SELECT p.id,
    p.pension_no,
    p.employee_no,
    TRIM(BOTH FROM concat_ws(' '::text, p.title, p.first_name, p.middle_name, p.last_name)) AS full_name,
    p.gender,
    p.date_of_birth,
    (date_part('year'::text, age((p.date_of_birth)::timestamp with time zone)))::integer AS age,
    d.name AS department_name,
    ds.name AS designation_name,
    ds.grade,
    p.date_of_first_appointment,
    p.date_of_retirement,
    p.years_of_service,
    p.monthly_pension,
    p.total_gratuity_due,
    p.pension_start_date,
    p.status,
    p.phone_primary,
    p.email,
    su.full_name AS introduced_by_name,
    p.created_at AS introduced_date
   FROM (((nps.pensioners p
     LEFT JOIN nps.departments d ON ((p.department_id = d.id)))
     LEFT JOIN nps.designations ds ON ((p.designation_id = ds.id)))
     LEFT JOIN nps.system_users su ON ((p.introduced_by = su.id)))
  WHERE (p.status = 'active'::nps.pension_status);


ALTER VIEW nps.v_active_pensioners OWNER TO postgres;

--
-- Name: v_gratuity_balance; Type: VIEW; Schema: nps; Owner: postgres
--

CREATE VIEW nps.v_gratuity_balance AS
 SELECT p.id AS pensioner_id,
    p.pension_no,
    p.employee_no,
    TRIM(BOTH FROM concat_ws(' '::text, p.first_name, p.last_name)) AS full_name,
    p.department_text AS department_name,
    p.total_gratuity_due,
    COALESCE(p.pre_retirement_gratuity_paid, (0)::numeric) AS pre_retirement_gratuity_paid,
    COALESCE(paid.system_paid, (0)::numeric) AS system_gratuity_paid,
    (COALESCE(p.pre_retirement_gratuity_paid, (0)::numeric) + COALESCE(paid.system_paid, (0)::numeric)) AS total_gratuity_paid,
    ((p.total_gratuity_due - COALESCE(p.pre_retirement_gratuity_paid, (0)::numeric)) - COALESCE(paid.system_paid, (0)::numeric)) AS gratuity_balance_remaining,
    COALESCE(paid.partial_count, (0)::bigint) AS partial_payments_count,
    COALESCE(paid.full_count, (0)::bigint) AS full_payments_count,
    paid.first_paid_date,
    paid.last_paid_date
   FROM (nps.pensioners p
     LEFT JOIN ( SELECT gratuity_records.pensioner_id,
            COALESCE(sum(gratuity_records.amount_requested), (0)::numeric) AS system_paid,
            count(*) FILTER (WHERE ((gratuity_records.is_partial = true) AND (gratuity_records.status = 'paid'::nps.gratuity_status))) AS partial_count,
            count(*) FILTER (WHERE ((gratuity_records.is_partial = false) AND (gratuity_records.status = 'paid'::nps.gratuity_status))) AS full_count,
            (min(gratuity_records.paid_at))::date AS first_paid_date,
            (max(gratuity_records.paid_at))::date AS last_paid_date
           FROM nps.gratuity_records
          WHERE (gratuity_records.status = 'paid'::nps.gratuity_status)
          GROUP BY gratuity_records.pensioner_id) paid ON ((paid.pensioner_id = p.id)));


ALTER VIEW nps.v_gratuity_balance OWNER TO postgres;

--
-- Name: v_gratuity_due; Type: VIEW; Schema: nps; Owner: postgres
--

CREATE VIEW nps.v_gratuity_due AS
 SELECT pensioner_id,
    pension_no,
    employee_no,
    full_name,
    department_name,
    total_gratuity_due,
    pre_retirement_gratuity_paid,
    system_gratuity_paid,
    total_gratuity_paid,
    gratuity_balance_remaining,
    partial_payments_count,
    full_payments_count,
    first_paid_date,
    last_paid_date
   FROM nps.v_gratuity_balance
  WHERE (gratuity_balance_remaining > (0)::numeric)
  ORDER BY gratuity_balance_remaining DESC;


ALTER VIEW nps.v_gratuity_due OWNER TO postgres;

--
-- Name: v_partial_gratuity_recipients; Type: VIEW; Schema: nps; Owner: postgres
--

CREATE VIEW nps.v_partial_gratuity_recipients AS
 SELECT gb.pensioner_id,
    gb.pension_no,
    gb.employee_no,
    gb.full_name,
    gb.department_name,
    gb.total_gratuity_due,
    gb.pre_retirement_gratuity_paid,
    gb.system_gratuity_paid,
    gb.total_gratuity_paid,
    gb.gratuity_balance_remaining,
    gb.partial_payments_count,
    gb.full_payments_count,
    gb.first_paid_date,
    gb.last_paid_date,
    gr_list.partial_amounts,
    gr_list.partial_dates
   FROM (nps.v_gratuity_balance gb
     LEFT JOIN ( SELECT gratuity_records.pensioner_id,
            string_agg((gratuity_records.amount_requested)::text, ', '::text ORDER BY gratuity_records.paid_at) AS partial_amounts,
            string_agg(((gratuity_records.paid_at)::date)::text, ', '::text ORDER BY gratuity_records.paid_at) AS partial_dates
           FROM nps.gratuity_records
          WHERE ((gratuity_records.is_partial = true) AND (gratuity_records.status = 'paid'::nps.gratuity_status))
          GROUP BY gratuity_records.pensioner_id) gr_list ON ((gr_list.pensioner_id = gb.pensioner_id)))
  WHERE ((gb.partial_payments_count > 0) OR (gb.pre_retirement_gratuity_paid > (0)::numeric));


ALTER VIEW nps.v_partial_gratuity_recipients OWNER TO postgres;

--
-- Name: v_payment_run_summary; Type: VIEW; Schema: nps; Owner: postgres
--

CREATE VIEW nps.v_payment_run_summary AS
 SELECT pr.id,
    pr.run_code,
    pr.payment_period,
    pr.payment_month,
    pr.payment_year,
    pr.scheduled_date,
    pr.total_pensioners,
    pr.total_gross_amount,
    pr.total_deductions,
    pr.total_net_amount,
    pr.status,
    pr.is_auto_generated,
    u1.full_name AS created_by_name,
    u2.full_name AS approved_by_1_name,
    u3.full_name AS approved_by_2_name,
    pr.created_at,
    pr.approved_at_1,
    pr.approved_at_2,
    pr.processed_at
   FROM (((nps.pension_payment_runs pr
     LEFT JOIN nps.system_users u1 ON ((pr.created_by = u1.id)))
     LEFT JOIN nps.system_users u2 ON ((pr.approved_by_1 = u2.id)))
     LEFT JOIN nps.system_users u3 ON ((pr.approved_by_2 = u3.id)));


ALTER VIEW nps.v_payment_run_summary OWNER TO postgres;

--
-- Name: workflow_audit_trail; Type: TABLE; Schema: nps; Owner: postgres
--

CREATE TABLE nps.workflow_audit_trail (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    entity_type character varying(100) NOT NULL,
    entity_id uuid NOT NULL,
    action nps.workflow_action NOT NULL,
    action_by uuid NOT NULL,
    action_at timestamp with time zone DEFAULT now() NOT NULL,
    previous_status character varying(100),
    new_status character varying(100),
    remarks text,
    ip_address inet,
    user_agent text
);


ALTER TABLE nps.workflow_audit_trail OWNER TO postgres;

--
-- Name: arrears arrears_arrear_ref_key; Type: CONSTRAINT; Schema: nps; Owner: postgres
--

ALTER TABLE ONLY nps.arrears
    ADD CONSTRAINT arrears_arrear_ref_key UNIQUE (arrear_ref);


--
-- Name: arrears arrears_pkey; Type: CONSTRAINT; Schema: nps; Owner: postgres
--

ALTER TABLE ONLY nps.arrears
    ADD CONSTRAINT arrears_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: nps; Owner: postgres
--

ALTER TABLE ONLY nps.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: bank_accounts bank_accounts_pkey; Type: CONSTRAINT; Schema: nps; Owner: postgres
--

ALTER TABLE ONLY nps.bank_accounts
    ADD CONSTRAINT bank_accounts_pkey PRIMARY KEY (id);


--
-- Name: death_notifications death_notifications_pkey; Type: CONSTRAINT; Schema: nps; Owner: postgres
--

ALTER TABLE ONLY nps.death_notifications
    ADD CONSTRAINT death_notifications_pkey PRIMARY KEY (id);


--
-- Name: departments departments_code_key; Type: CONSTRAINT; Schema: nps; Owner: postgres
--

ALTER TABLE ONLY nps.departments
    ADD CONSTRAINT departments_code_key UNIQUE (code);


--
-- Name: departments departments_pkey; Type: CONSTRAINT; Schema: nps; Owner: postgres
--

ALTER TABLE ONLY nps.departments
    ADD CONSTRAINT departments_pkey PRIMARY KEY (id);


--
-- Name: designations designations_code_key; Type: CONSTRAINT; Schema: nps; Owner: postgres
--

ALTER TABLE ONLY nps.designations
    ADD CONSTRAINT designations_code_key UNIQUE (code);


--
-- Name: designations designations_pkey; Type: CONSTRAINT; Schema: nps; Owner: postgres
--

ALTER TABLE ONLY nps.designations
    ADD CONSTRAINT designations_pkey PRIMARY KEY (id);


--
-- Name: gratuity_adjustments gratuity_adjustments_pkey; Type: CONSTRAINT; Schema: nps; Owner: postgres
--

ALTER TABLE ONLY nps.gratuity_adjustments
    ADD CONSTRAINT gratuity_adjustments_pkey PRIMARY KEY (id);


--
-- Name: gratuity_records gratuity_records_gratuity_ref_key; Type: CONSTRAINT; Schema: nps; Owner: postgres
--

ALTER TABLE ONLY nps.gratuity_records
    ADD CONSTRAINT gratuity_records_gratuity_ref_key UNIQUE (gratuity_ref);


--
-- Name: gratuity_records gratuity_records_pkey; Type: CONSTRAINT; Schema: nps; Owner: postgres
--

ALTER TABLE ONLY nps.gratuity_records
    ADD CONSTRAINT gratuity_records_pkey PRIMARY KEY (id);


--
-- Name: monthly_run_schedule monthly_run_schedule_pkey; Type: CONSTRAINT; Schema: nps; Owner: postgres
--

ALTER TABLE ONLY nps.monthly_run_schedule
    ADD CONSTRAINT monthly_run_schedule_pkey PRIMARY KEY (id);


--
-- Name: monthly_run_schedule monthly_run_schedule_schedule_month_schedule_year_key; Type: CONSTRAINT; Schema: nps; Owner: postgres
--

ALTER TABLE ONLY nps.monthly_run_schedule
    ADD CONSTRAINT monthly_run_schedule_schedule_month_schedule_year_key UNIQUE (schedule_month, schedule_year);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: nps; Owner: postgres
--

ALTER TABLE ONLY nps.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: pension_adjustments pension_adjustments_pkey; Type: CONSTRAINT; Schema: nps; Owner: postgres
--

ALTER TABLE ONLY nps.pension_adjustments
    ADD CONSTRAINT pension_adjustments_pkey PRIMARY KEY (id);


--
-- Name: pension_payment_lines pension_payment_lines_pkey; Type: CONSTRAINT; Schema: nps; Owner: postgres
--

ALTER TABLE ONLY nps.pension_payment_lines
    ADD CONSTRAINT pension_payment_lines_pkey PRIMARY KEY (id);


--
-- Name: pension_payment_lines pension_payment_lines_run_id_pensioner_id_key; Type: CONSTRAINT; Schema: nps; Owner: postgres
--

ALTER TABLE ONLY nps.pension_payment_lines
    ADD CONSTRAINT pension_payment_lines_run_id_pensioner_id_key UNIQUE (run_id, pensioner_id);


--
-- Name: pension_payment_runs pension_payment_runs_payment_month_payment_year_key; Type: CONSTRAINT; Schema: nps; Owner: postgres
--

ALTER TABLE ONLY nps.pension_payment_runs
    ADD CONSTRAINT pension_payment_runs_payment_month_payment_year_key UNIQUE (payment_month, payment_year);


--
-- Name: pension_payment_runs pension_payment_runs_pkey; Type: CONSTRAINT; Schema: nps; Owner: postgres
--

ALTER TABLE ONLY nps.pension_payment_runs
    ADD CONSTRAINT pension_payment_runs_pkey PRIMARY KEY (id);


--
-- Name: pension_payment_runs pension_payment_runs_run_code_key; Type: CONSTRAINT; Schema: nps; Owner: postgres
--

ALTER TABLE ONLY nps.pension_payment_runs
    ADD CONSTRAINT pension_payment_runs_run_code_key UNIQUE (run_code);


--
-- Name: pensioner_documents pensioner_documents_pkey; Type: CONSTRAINT; Schema: nps; Owner: postgres
--

ALTER TABLE ONLY nps.pensioner_documents
    ADD CONSTRAINT pensioner_documents_pkey PRIMARY KEY (id);


--
-- Name: pensioners pensioners_national_id_key; Type: CONSTRAINT; Schema: nps; Owner: postgres
--

ALTER TABLE ONLY nps.pensioners
    ADD CONSTRAINT pensioners_national_id_key UNIQUE (national_id);


--
-- Name: pensioners pensioners_pension_no_key; Type: CONSTRAINT; Schema: nps; Owner: postgres
--

ALTER TABLE ONLY nps.pensioners
    ADD CONSTRAINT pensioners_pension_no_key UNIQUE (pension_no);


--
-- Name: pensioners pensioners_pkey; Type: CONSTRAINT; Schema: nps; Owner: postgres
--

ALTER TABLE ONLY nps.pensioners
    ADD CONSTRAINT pensioners_pkey PRIMARY KEY (id);


--
-- Name: system_settings system_settings_pkey; Type: CONSTRAINT; Schema: nps; Owner: postgres
--

ALTER TABLE ONLY nps.system_settings
    ADD CONSTRAINT system_settings_pkey PRIMARY KEY (id);


--
-- Name: system_settings system_settings_setting_key_key; Type: CONSTRAINT; Schema: nps; Owner: postgres
--

ALTER TABLE ONLY nps.system_settings
    ADD CONSTRAINT system_settings_setting_key_key UNIQUE (setting_key);


--
-- Name: system_users system_users_email_key; Type: CONSTRAINT; Schema: nps; Owner: postgres
--

ALTER TABLE ONLY nps.system_users
    ADD CONSTRAINT system_users_email_key UNIQUE (email);


--
-- Name: system_users system_users_employee_no_key; Type: CONSTRAINT; Schema: nps; Owner: postgres
--

ALTER TABLE ONLY nps.system_users
    ADD CONSTRAINT system_users_employee_no_key UNIQUE (employee_no);


--
-- Name: system_users system_users_pkey; Type: CONSTRAINT; Schema: nps; Owner: postgres
--

ALTER TABLE ONLY nps.system_users
    ADD CONSTRAINT system_users_pkey PRIMARY KEY (id);


--
-- Name: system_users system_users_username_key; Type: CONSTRAINT; Schema: nps; Owner: postgres
--

ALTER TABLE ONLY nps.system_users
    ADD CONSTRAINT system_users_username_key UNIQUE (username);


--
-- Name: workflow_audit_trail workflow_audit_trail_pkey; Type: CONSTRAINT; Schema: nps; Owner: postgres
--

ALTER TABLE ONLY nps.workflow_audit_trail
    ADD CONSTRAINT workflow_audit_trail_pkey PRIMARY KEY (id);


--
-- Name: idx_arrears_pensioner; Type: INDEX; Schema: nps; Owner: postgres
--

CREATE INDEX idx_arrears_pensioner ON nps.arrears USING btree (pensioner_id);


--
-- Name: idx_arrears_status; Type: INDEX; Schema: nps; Owner: postgres
--

CREATE INDEX idx_arrears_status ON nps.arrears USING btree (status);


--
-- Name: idx_audit_logs_created; Type: INDEX; Schema: nps; Owner: postgres
--

CREATE INDEX idx_audit_logs_created ON nps.audit_logs USING btree (created_at);


--
-- Name: idx_audit_logs_user; Type: INDEX; Schema: nps; Owner: postgres
--

CREATE INDEX idx_audit_logs_user ON nps.audit_logs USING btree (user_id);


--
-- Name: idx_bank_one_primary; Type: INDEX; Schema: nps; Owner: postgres
--

CREATE UNIQUE INDEX idx_bank_one_primary ON nps.bank_accounts USING btree (pensioner_id) WHERE ((is_primary = true) AND (is_active = true));


--
-- Name: idx_gratuity_adj_pensioner; Type: INDEX; Schema: nps; Owner: postgres
--

CREATE INDEX idx_gratuity_adj_pensioner ON nps.gratuity_adjustments USING btree (pensioner_id);


--
-- Name: idx_gratuity_partial; Type: INDEX; Schema: nps; Owner: postgres
--

CREATE INDEX idx_gratuity_partial ON nps.gratuity_records USING btree (is_partial) WHERE (is_partial = true);


--
-- Name: idx_gratuity_pensioner; Type: INDEX; Schema: nps; Owner: postgres
--

CREATE INDEX idx_gratuity_pensioner ON nps.gratuity_records USING btree (pensioner_id);


--
-- Name: idx_gratuity_status; Type: INDEX; Schema: nps; Owner: postgres
--

CREATE INDEX idx_gratuity_status ON nps.gratuity_records USING btree (status);


--
-- Name: idx_gratuity_type; Type: INDEX; Schema: nps; Owner: postgres
--

CREATE INDEX idx_gratuity_type ON nps.gratuity_records USING btree (gratuity_type);


--
-- Name: idx_notifications_user; Type: INDEX; Schema: nps; Owner: postgres
--

CREATE INDEX idx_notifications_user ON nps.notifications USING btree (user_id, is_read);


--
-- Name: idx_payment_lines_pensioner; Type: INDEX; Schema: nps; Owner: postgres
--

CREATE INDEX idx_payment_lines_pensioner ON nps.pension_payment_lines USING btree (pensioner_id);


--
-- Name: idx_payment_lines_run; Type: INDEX; Schema: nps; Owner: postgres
--

CREATE INDEX idx_payment_lines_run ON nps.pension_payment_lines USING btree (run_id);


--
-- Name: idx_payment_lines_status; Type: INDEX; Schema: nps; Owner: postgres
--

CREATE INDEX idx_payment_lines_status ON nps.pension_payment_lines USING btree (status);


--
-- Name: idx_payment_runs_period; Type: INDEX; Schema: nps; Owner: postgres
--

CREATE INDEX idx_payment_runs_period ON nps.pension_payment_runs USING btree (payment_year, payment_month);


--
-- Name: idx_payment_runs_scheduled; Type: INDEX; Schema: nps; Owner: postgres
--

CREATE INDEX idx_payment_runs_scheduled ON nps.pension_payment_runs USING btree (scheduled_date);


--
-- Name: idx_payment_runs_status; Type: INDEX; Schema: nps; Owner: postgres
--

CREATE INDEX idx_payment_runs_status ON nps.pension_payment_runs USING btree (status);


--
-- Name: idx_pension_adj_pensioner; Type: INDEX; Schema: nps; Owner: postgres
--

CREATE INDEX idx_pension_adj_pensioner ON nps.pension_adjustments USING btree (pensioner_id);


--
-- Name: idx_pensioners_created_at; Type: INDEX; Schema: nps; Owner: postgres
--

CREATE INDEX idx_pensioners_created_at ON nps.pensioners USING btree (created_at);


--
-- Name: idx_pensioners_deceased; Type: INDEX; Schema: nps; Owner: postgres
--

CREATE INDEX idx_pensioners_deceased ON nps.pensioners USING btree (status, date_of_death) WHERE (status = 'deceased'::nps.pension_status);


--
-- Name: idx_pensioners_deceased_on_entry; Type: INDEX; Schema: nps; Owner: postgres
--

CREATE INDEX idx_pensioners_deceased_on_entry ON nps.pensioners USING btree (deceased_on_entry) WHERE (deceased_on_entry = true);


--
-- Name: idx_pensioners_department; Type: INDEX; Schema: nps; Owner: postgres
--

CREATE INDEX idx_pensioners_department ON nps.pensioners USING btree (department_id);


--
-- Name: idx_pensioners_designation; Type: INDEX; Schema: nps; Owner: postgres
--

CREATE INDEX idx_pensioners_designation ON nps.pensioners USING btree (designation_id);


--
-- Name: idx_pensioners_employee_no; Type: INDEX; Schema: nps; Owner: postgres
--

CREATE INDEX idx_pensioners_employee_no ON nps.pensioners USING btree (employee_no);


--
-- Name: idx_pensioners_introduced; Type: INDEX; Schema: nps; Owner: postgres
--

CREATE INDEX idx_pensioners_introduced ON nps.pensioners USING btree (introduced_by);


--
-- Name: idx_pensioners_name; Type: INDEX; Schema: nps; Owner: postgres
--

CREATE INDEX idx_pensioners_name ON nps.pensioners USING btree (last_name, first_name);


--
-- Name: idx_pensioners_pension_no; Type: INDEX; Schema: nps; Owner: postgres
--

CREATE INDEX idx_pensioners_pension_no ON nps.pensioners USING btree (pension_no);


--
-- Name: idx_pensioners_status; Type: INDEX; Schema: nps; Owner: postgres
--

CREATE INDEX idx_pensioners_status ON nps.pensioners USING btree (status);


--
-- Name: idx_users_session_token; Type: INDEX; Schema: nps; Owner: postgres
--

CREATE INDEX idx_users_session_token ON nps.system_users USING btree (session_token) WHERE (session_token IS NOT NULL);


--
-- Name: idx_workflow_action_by; Type: INDEX; Schema: nps; Owner: postgres
--

CREATE INDEX idx_workflow_action_by ON nps.workflow_audit_trail USING btree (action_by);


--
-- Name: idx_workflow_entity; Type: INDEX; Schema: nps; Owner: postgres
--

CREATE INDEX idx_workflow_entity ON nps.workflow_audit_trail USING btree (entity_type, entity_id);


--
-- Name: arrears trg_arrears_updated_at; Type: TRIGGER; Schema: nps; Owner: postgres
--

CREATE TRIGGER trg_arrears_updated_at BEFORE UPDATE ON nps.arrears FOR EACH ROW EXECUTE FUNCTION nps.set_updated_at();


--
-- Name: bank_accounts trg_bank_accounts_updated_at; Type: TRIGGER; Schema: nps; Owner: postgres
--

CREATE TRIGGER trg_bank_accounts_updated_at BEFORE UPDATE ON nps.bank_accounts FOR EACH ROW EXECUTE FUNCTION nps.set_updated_at();


--
-- Name: gratuity_records trg_check_gratuity; Type: TRIGGER; Schema: nps; Owner: postgres
--

CREATE TRIGGER trg_check_gratuity BEFORE INSERT OR UPDATE ON nps.gratuity_records FOR EACH ROW EXECUTE FUNCTION nps.check_gratuity_limit();


--
-- Name: departments trg_departments_updated_at; Type: TRIGGER; Schema: nps; Owner: postgres
--

CREATE TRIGGER trg_departments_updated_at BEFORE UPDATE ON nps.departments FOR EACH ROW EXECUTE FUNCTION nps.set_updated_at();


--
-- Name: designations trg_designations_updated_at; Type: TRIGGER; Schema: nps; Owner: postgres
--

CREATE TRIGGER trg_designations_updated_at BEFORE UPDATE ON nps.designations FOR EACH ROW EXECUTE FUNCTION nps.set_updated_at();


--
-- Name: gratuity_records trg_gratuity_updated_at; Type: TRIGGER; Schema: nps; Owner: postgres
--

CREATE TRIGGER trg_gratuity_updated_at BEFORE UPDATE ON nps.gratuity_records FOR EACH ROW EXECUTE FUNCTION nps.set_gratuity_updated_at();


--
-- Name: pensioners trg_log_gratuity_adj; Type: TRIGGER; Schema: nps; Owner: postgres
--

CREATE TRIGGER trg_log_gratuity_adj AFTER UPDATE OF total_gratuity_due ON nps.pensioners FOR EACH ROW EXECUTE FUNCTION nps.log_gratuity_adjustment();


--
-- Name: pensioners trg_log_pension_adj; Type: TRIGGER; Schema: nps; Owner: postgres
--

CREATE TRIGGER trg_log_pension_adj AFTER UPDATE OF monthly_pension ON nps.pensioners FOR EACH ROW EXECUTE FUNCTION nps.log_pension_adjustment();


--
-- Name: pension_payment_lines trg_payment_lines_updated_at; Type: TRIGGER; Schema: nps; Owner: postgres
--

CREATE TRIGGER trg_payment_lines_updated_at BEFORE UPDATE ON nps.pension_payment_lines FOR EACH ROW EXECUTE FUNCTION nps.set_updated_at();


--
-- Name: pension_payment_runs trg_payment_runs_updated_at; Type: TRIGGER; Schema: nps; Owner: postgres
--

CREATE TRIGGER trg_payment_runs_updated_at BEFORE UPDATE ON nps.pension_payment_runs FOR EACH ROW EXECUTE FUNCTION nps.set_updated_at();


--
-- Name: pensioners trg_pensioners_updated_at; Type: TRIGGER; Schema: nps; Owner: postgres
--

CREATE TRIGGER trg_pensioners_updated_at BEFORE UPDATE ON nps.pensioners FOR EACH ROW EXECUTE FUNCTION nps.set_updated_at();


--
-- Name: pensioners trg_sync_death_status; Type: TRIGGER; Schema: nps; Owner: postgres
--

CREATE TRIGGER trg_sync_death_status BEFORE UPDATE OF date_of_death ON nps.pensioners FOR EACH ROW EXECUTE FUNCTION nps.sync_death_status();


--
-- Name: system_users trg_system_users_updated_at; Type: TRIGGER; Schema: nps; Owner: postgres
--

CREATE TRIGGER trg_system_users_updated_at BEFORE UPDATE ON nps.system_users FOR EACH ROW EXECUTE FUNCTION nps.set_updated_at();


--
-- Name: pension_payment_lines trg_update_run_totals; Type: TRIGGER; Schema: nps; Owner: postgres
--

CREATE TRIGGER trg_update_run_totals AFTER INSERT OR UPDATE ON nps.pension_payment_lines FOR EACH ROW EXECUTE FUNCTION nps.update_run_totals();


--
-- Name: arrears arrears_approved_by_fkey; Type: FK CONSTRAINT; Schema: nps; Owner: postgres
--

ALTER TABLE ONLY nps.arrears
    ADD CONSTRAINT arrears_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES nps.system_users(id);


--
-- Name: arrears arrears_bank_account_id_fkey; Type: FK CONSTRAINT; Schema: nps; Owner: postgres
--

ALTER TABLE ONLY nps.arrears
    ADD CONSTRAINT arrears_bank_account_id_fkey FOREIGN KEY (bank_account_id) REFERENCES nps.bank_accounts(id);


--
-- Name: arrears arrears_created_by_fkey; Type: FK CONSTRAINT; Schema: nps; Owner: postgres
--

ALTER TABLE ONLY nps.arrears
    ADD CONSTRAINT arrears_created_by_fkey FOREIGN KEY (created_by) REFERENCES nps.system_users(id);


--
-- Name: arrears arrears_paid_by_fkey; Type: FK CONSTRAINT; Schema: nps; Owner: postgres
--

ALTER TABLE ONLY nps.arrears
    ADD CONSTRAINT arrears_paid_by_fkey FOREIGN KEY (paid_by) REFERENCES nps.system_users(id);


--
-- Name: arrears arrears_pensioner_id_fkey; Type: FK CONSTRAINT; Schema: nps; Owner: postgres
--

ALTER TABLE ONLY nps.arrears
    ADD CONSTRAINT arrears_pensioner_id_fkey FOREIGN KEY (pensioner_id) REFERENCES nps.pensioners(id);


--
-- Name: audit_logs audit_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: nps; Owner: postgres
--

ALTER TABLE ONLY nps.audit_logs
    ADD CONSTRAINT audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES nps.system_users(id);


--
-- Name: bank_accounts bank_accounts_created_by_fkey; Type: FK CONSTRAINT; Schema: nps; Owner: postgres
--

ALTER TABLE ONLY nps.bank_accounts
    ADD CONSTRAINT bank_accounts_created_by_fkey FOREIGN KEY (created_by) REFERENCES nps.system_users(id);


--
-- Name: bank_accounts bank_accounts_pensioner_id_fkey; Type: FK CONSTRAINT; Schema: nps; Owner: postgres
--

ALTER TABLE ONLY nps.bank_accounts
    ADD CONSTRAINT bank_accounts_pensioner_id_fkey FOREIGN KEY (pensioner_id) REFERENCES nps.pensioners(id) ON DELETE CASCADE;


--
-- Name: death_notifications death_notifications_final_payment_run_id_fkey; Type: FK CONSTRAINT; Schema: nps; Owner: postgres
--

ALTER TABLE ONLY nps.death_notifications
    ADD CONSTRAINT death_notifications_final_payment_run_id_fkey FOREIGN KEY (final_payment_run_id) REFERENCES nps.pension_payment_runs(id);


--
-- Name: death_notifications death_notifications_gratuity_id_fkey; Type: FK CONSTRAINT; Schema: nps; Owner: postgres
--

ALTER TABLE ONLY nps.death_notifications
    ADD CONSTRAINT death_notifications_gratuity_id_fkey FOREIGN KEY (gratuity_id) REFERENCES nps.gratuity_records(id);


--
-- Name: death_notifications death_notifications_pensioner_id_fkey; Type: FK CONSTRAINT; Schema: nps; Owner: postgres
--

ALTER TABLE ONLY nps.death_notifications
    ADD CONSTRAINT death_notifications_pensioner_id_fkey FOREIGN KEY (pensioner_id) REFERENCES nps.pensioners(id);


--
-- Name: death_notifications death_notifications_recorded_by_fkey; Type: FK CONSTRAINT; Schema: nps; Owner: postgres
--

ALTER TABLE ONLY nps.death_notifications
    ADD CONSTRAINT death_notifications_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES nps.system_users(id);


--
-- Name: departments departments_parent_id_fkey; Type: FK CONSTRAINT; Schema: nps; Owner: postgres
--

ALTER TABLE ONLY nps.departments
    ADD CONSTRAINT departments_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES nps.departments(id);


--
-- Name: gratuity_adjustments gratuity_adjustments_adjusted_by_fkey; Type: FK CONSTRAINT; Schema: nps; Owner: postgres
--

ALTER TABLE ONLY nps.gratuity_adjustments
    ADD CONSTRAINT gratuity_adjustments_adjusted_by_fkey FOREIGN KEY (adjusted_by) REFERENCES nps.system_users(id);


--
-- Name: gratuity_adjustments gratuity_adjustments_pensioner_id_fkey; Type: FK CONSTRAINT; Schema: nps; Owner: postgres
--

ALTER TABLE ONLY nps.gratuity_adjustments
    ADD CONSTRAINT gratuity_adjustments_pensioner_id_fkey FOREIGN KEY (pensioner_id) REFERENCES nps.pensioners(id);


--
-- Name: gratuity_records gratuity_records_approved_by_1_fkey; Type: FK CONSTRAINT; Schema: nps; Owner: postgres
--

ALTER TABLE ONLY nps.gratuity_records
    ADD CONSTRAINT gratuity_records_approved_by_1_fkey FOREIGN KEY (approved_by_1) REFERENCES nps.system_users(id);


--
-- Name: gratuity_records gratuity_records_approved_by_2_fkey; Type: FK CONSTRAINT; Schema: nps; Owner: postgres
--

ALTER TABLE ONLY nps.gratuity_records
    ADD CONSTRAINT gratuity_records_approved_by_2_fkey FOREIGN KEY (approved_by_2) REFERENCES nps.system_users(id);


--
-- Name: gratuity_records gratuity_records_bank_account_id_fkey; Type: FK CONSTRAINT; Schema: nps; Owner: postgres
--

ALTER TABLE ONLY nps.gratuity_records
    ADD CONSTRAINT gratuity_records_bank_account_id_fkey FOREIGN KEY (bank_account_id) REFERENCES nps.bank_accounts(id);


--
-- Name: gratuity_records gratuity_records_created_by_fkey; Type: FK CONSTRAINT; Schema: nps; Owner: postgres
--

ALTER TABLE ONLY nps.gratuity_records
    ADD CONSTRAINT gratuity_records_created_by_fkey FOREIGN KEY (created_by) REFERENCES nps.system_users(id);


--
-- Name: gratuity_records gratuity_records_paid_by_fkey; Type: FK CONSTRAINT; Schema: nps; Owner: postgres
--

ALTER TABLE ONLY nps.gratuity_records
    ADD CONSTRAINT gratuity_records_paid_by_fkey FOREIGN KEY (paid_by) REFERENCES nps.system_users(id);


--
-- Name: gratuity_records gratuity_records_pensioner_id_fkey; Type: FK CONSTRAINT; Schema: nps; Owner: postgres
--

ALTER TABLE ONLY nps.gratuity_records
    ADD CONSTRAINT gratuity_records_pensioner_id_fkey FOREIGN KEY (pensioner_id) REFERENCES nps.pensioners(id);


--
-- Name: gratuity_records gratuity_records_submitted_by_fkey; Type: FK CONSTRAINT; Schema: nps; Owner: postgres
--

ALTER TABLE ONLY nps.gratuity_records
    ADD CONSTRAINT gratuity_records_submitted_by_fkey FOREIGN KEY (submitted_by) REFERENCES nps.system_users(id);


--
-- Name: monthly_run_schedule monthly_run_schedule_run_id_fkey; Type: FK CONSTRAINT; Schema: nps; Owner: postgres
--

ALTER TABLE ONLY nps.monthly_run_schedule
    ADD CONSTRAINT monthly_run_schedule_run_id_fkey FOREIGN KEY (run_id) REFERENCES nps.pension_payment_runs(id);


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: nps; Owner: postgres
--

ALTER TABLE ONLY nps.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES nps.system_users(id);


--
-- Name: pension_adjustments pension_adjustments_adjusted_by_fkey; Type: FK CONSTRAINT; Schema: nps; Owner: postgres
--

ALTER TABLE ONLY nps.pension_adjustments
    ADD CONSTRAINT pension_adjustments_adjusted_by_fkey FOREIGN KEY (adjusted_by) REFERENCES nps.system_users(id);


--
-- Name: pension_adjustments pension_adjustments_pensioner_id_fkey; Type: FK CONSTRAINT; Schema: nps; Owner: postgres
--

ALTER TABLE ONLY nps.pension_adjustments
    ADD CONSTRAINT pension_adjustments_pensioner_id_fkey FOREIGN KEY (pensioner_id) REFERENCES nps.pensioners(id);


--
-- Name: pension_payment_lines pension_payment_lines_bank_account_id_fkey; Type: FK CONSTRAINT; Schema: nps; Owner: postgres
--

ALTER TABLE ONLY nps.pension_payment_lines
    ADD CONSTRAINT pension_payment_lines_bank_account_id_fkey FOREIGN KEY (bank_account_id) REFERENCES nps.bank_accounts(id);


--
-- Name: pension_payment_lines pension_payment_lines_pensioner_id_fkey; Type: FK CONSTRAINT; Schema: nps; Owner: postgres
--

ALTER TABLE ONLY nps.pension_payment_lines
    ADD CONSTRAINT pension_payment_lines_pensioner_id_fkey FOREIGN KEY (pensioner_id) REFERENCES nps.pensioners(id);


--
-- Name: pension_payment_lines pension_payment_lines_run_id_fkey; Type: FK CONSTRAINT; Schema: nps; Owner: postgres
--

ALTER TABLE ONLY nps.pension_payment_lines
    ADD CONSTRAINT pension_payment_lines_run_id_fkey FOREIGN KEY (run_id) REFERENCES nps.pension_payment_runs(id) ON DELETE CASCADE;


--
-- Name: pension_payment_runs pension_payment_runs_approved_by_1_fkey; Type: FK CONSTRAINT; Schema: nps; Owner: postgres
--

ALTER TABLE ONLY nps.pension_payment_runs
    ADD CONSTRAINT pension_payment_runs_approved_by_1_fkey FOREIGN KEY (approved_by_1) REFERENCES nps.system_users(id);


--
-- Name: pension_payment_runs pension_payment_runs_approved_by_2_fkey; Type: FK CONSTRAINT; Schema: nps; Owner: postgres
--

ALTER TABLE ONLY nps.pension_payment_runs
    ADD CONSTRAINT pension_payment_runs_approved_by_2_fkey FOREIGN KEY (approved_by_2) REFERENCES nps.system_users(id);


--
-- Name: pension_payment_runs pension_payment_runs_created_by_fkey; Type: FK CONSTRAINT; Schema: nps; Owner: postgres
--

ALTER TABLE ONLY nps.pension_payment_runs
    ADD CONSTRAINT pension_payment_runs_created_by_fkey FOREIGN KEY (created_by) REFERENCES nps.system_users(id);


--
-- Name: pension_payment_runs pension_payment_runs_submitted_by_fkey; Type: FK CONSTRAINT; Schema: nps; Owner: postgres
--

ALTER TABLE ONLY nps.pension_payment_runs
    ADD CONSTRAINT pension_payment_runs_submitted_by_fkey FOREIGN KEY (submitted_by) REFERENCES nps.system_users(id);


--
-- Name: pensioner_documents pensioner_documents_pensioner_id_fkey; Type: FK CONSTRAINT; Schema: nps; Owner: postgres
--

ALTER TABLE ONLY nps.pensioner_documents
    ADD CONSTRAINT pensioner_documents_pensioner_id_fkey FOREIGN KEY (pensioner_id) REFERENCES nps.pensioners(id) ON DELETE CASCADE;


--
-- Name: pensioner_documents pensioner_documents_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: nps; Owner: postgres
--

ALTER TABLE ONLY nps.pensioner_documents
    ADD CONSTRAINT pensioner_documents_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES nps.system_users(id);


--
-- Name: pensioners pensioners_department_id_fkey; Type: FK CONSTRAINT; Schema: nps; Owner: postgres
--

ALTER TABLE ONLY nps.pensioners
    ADD CONSTRAINT pensioners_department_id_fkey FOREIGN KEY (department_id) REFERENCES nps.departments(id);


--
-- Name: pensioners pensioners_designation_id_fkey; Type: FK CONSTRAINT; Schema: nps; Owner: postgres
--

ALTER TABLE ONLY nps.pensioners
    ADD CONSTRAINT pensioners_designation_id_fkey FOREIGN KEY (designation_id) REFERENCES nps.designations(id);


--
-- Name: pensioners pensioners_introduced_by_fkey; Type: FK CONSTRAINT; Schema: nps; Owner: postgres
--

ALTER TABLE ONLY nps.pensioners
    ADD CONSTRAINT pensioners_introduced_by_fkey FOREIGN KEY (introduced_by) REFERENCES nps.system_users(id);


--
-- Name: system_settings system_settings_updated_by_fkey; Type: FK CONSTRAINT; Schema: nps; Owner: postgres
--

ALTER TABLE ONLY nps.system_settings
    ADD CONSTRAINT system_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES nps.system_users(id);


--
-- Name: system_users system_users_created_by_fkey; Type: FK CONSTRAINT; Schema: nps; Owner: postgres
--

ALTER TABLE ONLY nps.system_users
    ADD CONSTRAINT system_users_created_by_fkey FOREIGN KEY (created_by) REFERENCES nps.system_users(id);


--
-- Name: system_users system_users_department_id_fkey; Type: FK CONSTRAINT; Schema: nps; Owner: postgres
--

ALTER TABLE ONLY nps.system_users
    ADD CONSTRAINT system_users_department_id_fkey FOREIGN KEY (department_id) REFERENCES nps.departments(id);


--
-- Name: workflow_audit_trail workflow_audit_trail_action_by_fkey; Type: FK CONSTRAINT; Schema: nps; Owner: postgres
--

ALTER TABLE ONLY nps.workflow_audit_trail
    ADD CONSTRAINT workflow_audit_trail_action_by_fkey FOREIGN KEY (action_by) REFERENCES nps.system_users(id);


--
-- PostgreSQL database dump complete
--


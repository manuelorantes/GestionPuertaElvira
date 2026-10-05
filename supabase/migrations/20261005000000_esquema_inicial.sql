-- Esquema inicial del gestor (volcado de las migraciones de Doctrine al pasar a Supabase).
SET check_function_bodies = false;
CREATE FUNCTION public.audit_capture() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_action UUID := NULLIF(current_setting('audit.action_id', true), '')::uuid;
    v_row JSONB;
    v_key JSONB;
BEGIN
    IF TG_OP = 'UPDATE' AND to_jsonb(OLD) = to_jsonb(NEW) THEN
        RETURN NULL;
    END IF;
    IF v_action IS NULL THEN
        v_action := gen_random_uuid();
        PERFORM set_config('audit.action_id', v_action::text, true);
    END IF;
    INSERT INTO audit_action (id, kind, user_id, user_name, label)
    VALUES (
        v_action,
        COALESCE(NULLIF(current_setting('audit.kind', true), ''), 'change'),
        NULLIF(current_setting('audit.user_id', true), '')::uuid,
        COALESCE(NULLIF(current_setting('audit.user_name', true), ''), 'Sistema'),
        COALESCE(NULLIF(current_setting('audit.label', true), ''), 'Cambio desde la consola')
    )
    ON CONFLICT (id) DO NOTHING;
    v_row := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
    SELECT jsonb_object_agg(k, v_row -> k) INTO v_key FROM unnest(TG_ARGV) AS k;
    INSERT INTO audit_change (action_id, table_name, row_key, operation, before, after)
    VALUES (
        v_action, TG_TABLE_NAME, v_key, left(TG_OP, 1),
        CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END,
        CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END
    );
    RETURN NULL;
END $$;
CREATE FUNCTION public.audit_revert_change(p_change bigint) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
    c audit_change%ROWTYPE;
    v_where TEXT;
    v_set TEXT;
BEGIN
    SELECT * INTO c FROM audit_change WHERE id = p_change;
    SELECT string_agg(format('t.%I = %L', k, c.row_key ->> k), ' AND ') INTO v_where FROM jsonb_object_keys(c.row_key) AS k;
    IF c.operation = 'I' THEN
        EXECUTE format('DELETE FROM %I t WHERE %s', c.table_name, v_where);
    ELSIF c.operation = 'D' THEN
        EXECUTE format('INSERT INTO %I SELECT * FROM jsonb_populate_record(NULL::%I, %L)', c.table_name, c.table_name, c.before);
    ELSE
        SELECT string_agg(format('%I = r.%I', k, k), ', ') INTO v_set FROM jsonb_object_keys(c.before) AS k;
        EXECUTE format('UPDATE %I t SET %s FROM jsonb_populate_record(NULL::%I, %L) r WHERE %s', c.table_name, v_set, c.table_name, c.before, v_where);
    END IF;
END $$;
CREATE TABLE accounting_closing (
    start_year smallint NOT NULL,
    income_cents integer NOT NULL,
    expense_cents integer NOT NULL,
    closed_on date NOT NULL
);
CREATE TABLE accounting_entry (
    id uuid NOT NULL,
    entry_date date NOT NULL,
    kind character varying(10) NOT NULL,
    concept character varying(120) NOT NULL,
    category character varying(20) NOT NULL,
    method character varying(10) NOT NULL,
    amount_cents integer NOT NULL
);
CREATE TABLE accounting_invoice (
    id uuid NOT NULL,
    invoice_date date NOT NULL,
    number character varying(40) NOT NULL,
    supplier character varying(120) NOT NULL,
    concept character varying(120) NOT NULL,
    category character varying(20) NOT NULL,
    amount_cents integer NOT NULL,
    paid_on date,
    method character varying(10) DEFAULT NULL::character varying,
    attachment_key character varying(200) DEFAULT NULL::character varying,
    attachment_name character varying(200) DEFAULT NULL::character varying,
    attachment_type character varying(40) DEFAULT NULL::character varying,
    attachment_bytes integer
);
CREATE TABLE audit_action (
    id uuid NOT NULL,
    seq bigint NOT NULL,
    kind character varying(12) NOT NULL,
    user_id uuid,
    user_name character varying(120) NOT NULL,
    label character varying(160) NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    reverts uuid
);
CREATE SEQUENCE public.audit_action_seq_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.audit_action_seq_seq OWNED BY public.audit_action.seq;
CREATE TABLE audit_change (
    id bigint NOT NULL,
    action_id uuid NOT NULL,
    table_name character varying(63) NOT NULL,
    row_key jsonb NOT NULL,
    operation character(1) NOT NULL,
    before jsonb,
    after jsonb
);
CREATE SEQUENCE public.audit_change_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.audit_change_id_seq OWNED BY public.audit_change.id;
CREATE TABLE billing_account (
    student_id uuid NOT NULL,
    preferred_plan character varying(20) NOT NULL,
    member boolean NOT NULL,
    private_rate_cents integer,
    points integer NOT NULL
);
CREATE TABLE billing_charge (
    id uuid NOT NULL,
    student_id uuid NOT NULL,
    kind character varying(12) NOT NULL,
    period character varying(7) NOT NULL,
    amount_cents integer NOT NULL,
    paid_by uuid,
    reminded_on date
);
CREATE TABLE billing_document_sequence (
    prefix character varying(1) NOT NULL,
    season_year smallint NOT NULL,
    last_value integer NOT NULL
);
CREATE TABLE billing_payment (
    id uuid NOT NULL,
    student_id uuid NOT NULL,
    paid_on date NOT NULL,
    method character varying(10) NOT NULL,
    receipt_number character varying(16) NOT NULL,
    kind character varying(12) NOT NULL,
    concept character varying(120) NOT NULL,
    lines json NOT NULL,
    total_cents integer NOT NULL,
    periods json NOT NULL,
    invoice_number character varying(16) DEFAULT NULL::character varying,
    invoice json
);
CREATE TABLE billing_settings (
    id character varying(20) NOT NULL,
    data json NOT NULL
);
CREATE TABLE classes_enrolment (
    id uuid NOT NULL,
    student_id uuid NOT NULL,
    class_group_id uuid NOT NULL,
    enrolled_on date NOT NULL,
    ends_on date
);
CREATE TABLE classes_group (
    id uuid NOT NULL,
    name character varying(60) NOT NULL,
    level character varying(20) NOT NULL,
    teacher_id uuid NOT NULL,
    days json NOT NULL,
    start_minutes smallint NOT NULL,
    end_minutes smallint NOT NULL,
    classroom smallint NOT NULL,
    capacity smallint NOT NULL
);
CREATE TABLE identity_login_attempt (
    key character varying(80) NOT NULL,
    failures integer NOT NULL,
    window_started_at timestamp(0) with time zone NOT NULL
);
CREATE TABLE identity_session (
    id uuid NOT NULL,
    token_hash character varying(64) NOT NULL,
    user_id uuid NOT NULL,
    started_at timestamp(0) with time zone NOT NULL,
    last_activity_at timestamp(0) with time zone NOT NULL
);
CREATE TABLE identity_user (
    id uuid NOT NULL,
    email character varying(254) NOT NULL,
    full_name character varying(120) NOT NULL,
    role character varying(20) NOT NULL,
    password_hash character varying(255) NOT NULL,
    status character varying(20) NOT NULL,
    must_change_password boolean NOT NULL,
    created_at timestamp(0) with time zone NOT NULL,
    password_changed_at timestamp(0) with time zone NOT NULL
);
CREATE TABLE payroll_proposed_month (
    month character varying(7) NOT NULL
);
CREATE TABLE payroll_session (
    id uuid NOT NULL,
    teacher_id uuid NOT NULL,
    session_date date NOT NULL,
    group_id uuid,
    label character varying(80) NOT NULL,
    minutes smallint NOT NULL,
    from_schedule boolean NOT NULL
);
CREATE TABLE payroll_settlement (
    teacher_id uuid NOT NULL,
    month character varying(7) NOT NULL,
    minutes integer NOT NULL,
    rate_cents integer NOT NULL,
    amount_cents integer NOT NULL,
    lines json NOT NULL,
    paid_on date NOT NULL
);
CREATE TABLE students_student (
    id uuid NOT NULL,
    full_name character varying(120) NOT NULL,
    search_name character varying(120) NOT NULL,
    birth_date date NOT NULL,
    national_id character varying(9) DEFAULT NULL::character varying,
    contact_email character varying(254) DEFAULT NULL::character varying,
    guardians json NOT NULL,
    own_phone character varying(12) DEFAULT NULL::character varying,
    federation_licence character varying(20) DEFAULT NULL::character varying,
    image_consent boolean NOT NULL,
    joined_on date NOT NULL,
    withdrawn_on date,
    sibling_ids json NOT NULL
);
CREATE TABLE teachers_teacher (
    id uuid NOT NULL,
    full_name character varying(120) NOT NULL,
    active boolean NOT NULL,
    hourly_rate_cents integer DEFAULT 1500 NOT NULL
);
ALTER TABLE ONLY public.audit_action ALTER COLUMN seq SET DEFAULT nextval('public.audit_action_seq_seq'::regclass);
ALTER TABLE ONLY public.audit_change ALTER COLUMN id SET DEFAULT nextval('public.audit_change_id_seq'::regclass);
ALTER TABLE ONLY public.accounting_closing
    ADD CONSTRAINT accounting_closing_pkey PRIMARY KEY (start_year);
ALTER TABLE ONLY public.accounting_entry
    ADD CONSTRAINT accounting_entry_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.accounting_invoice
    ADD CONSTRAINT accounting_invoice_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.audit_action
    ADD CONSTRAINT audit_action_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.audit_action
    ADD CONSTRAINT audit_action_seq_key UNIQUE (seq);
ALTER TABLE ONLY public.audit_change
    ADD CONSTRAINT audit_change_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.billing_account
    ADD CONSTRAINT billing_account_pkey PRIMARY KEY (student_id);
ALTER TABLE ONLY public.billing_charge
    ADD CONSTRAINT billing_charge_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.billing_document_sequence
    ADD CONSTRAINT billing_document_sequence_pkey PRIMARY KEY (prefix, season_year);
ALTER TABLE ONLY public.billing_payment
    ADD CONSTRAINT billing_payment_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.billing_settings
    ADD CONSTRAINT billing_settings_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.classes_enrolment
    ADD CONSTRAINT classes_enrolment_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.classes_group
    ADD CONSTRAINT classes_group_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.identity_login_attempt
    ADD CONSTRAINT identity_login_attempt_pkey PRIMARY KEY (key);
ALTER TABLE ONLY public.identity_session
    ADD CONSTRAINT identity_session_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.identity_user
    ADD CONSTRAINT identity_user_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.payroll_proposed_month
    ADD CONSTRAINT payroll_proposed_month_pkey PRIMARY KEY (month);
ALTER TABLE ONLY public.payroll_session
    ADD CONSTRAINT payroll_session_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.payroll_settlement
    ADD CONSTRAINT payroll_settlement_pkey PRIMARY KEY (teacher_id, month);
ALTER TABLE ONLY public.students_student
    ADD CONSTRAINT students_student_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.teachers_teacher
    ADD CONSTRAINT teachers_teacher_pkey PRIMARY KEY (id);
CREATE INDEX accounting_entry_date_idx ON public.accounting_entry USING btree (entry_date);
CREATE INDEX accounting_invoice_paid_idx ON public.accounting_invoice USING btree (paid_on);
CREATE INDEX audit_action_user_idx ON public.audit_action USING btree (user_id);
CREATE INDEX audit_change_action_idx ON public.audit_change USING btree (action_id);
CREATE INDEX audit_change_row_idx ON public.audit_change USING btree (table_name, row_key);
CREATE INDEX billing_charge_period_idx ON public.billing_charge USING btree (period);
CREATE UNIQUE INDEX billing_charge_unique ON public.billing_charge USING btree (student_id, kind, period);
CREATE INDEX billing_payment_student_idx ON public.billing_payment USING btree (student_id);
CREATE INDEX classes_enrolment_group_idx ON public.classes_enrolment USING btree (class_group_id);
CREATE INDEX classes_enrolment_student_idx ON public.classes_enrolment USING btree (student_id);
CREATE INDEX classes_group_teacher_idx ON public.classes_group USING btree (teacher_id);
CREATE UNIQUE INDEX identity_session_token_hash_unique ON public.identity_session USING btree (token_hash);
CREATE INDEX identity_session_user_idx ON public.identity_session USING btree (user_id);
CREATE UNIQUE INDEX identity_user_email_unique ON public.identity_user USING btree (email);
CREATE INDEX payroll_session_date_idx ON public.payroll_session USING btree (session_date);
CREATE INDEX students_student_search_idx ON public.students_student USING btree (search_name);
CREATE UNIQUE INDEX uniq_6060fda2da68207 ON public.billing_payment USING btree (invoice_number);
CREATE UNIQUE INDEX uniq_6060fdab0adb74c ON public.billing_payment USING btree (receipt_number);
CREATE TRIGGER accounting_closing_audit AFTER INSERT OR DELETE OR UPDATE ON public.accounting_closing FOR EACH ROW EXECUTE FUNCTION public.audit_capture('start_year');
CREATE TRIGGER accounting_entry_audit AFTER INSERT OR DELETE OR UPDATE ON public.accounting_entry FOR EACH ROW EXECUTE FUNCTION public.audit_capture('id');
CREATE TRIGGER accounting_invoice_audit AFTER INSERT OR DELETE OR UPDATE ON public.accounting_invoice FOR EACH ROW EXECUTE FUNCTION public.audit_capture('id');
CREATE TRIGGER billing_account_audit AFTER INSERT OR DELETE OR UPDATE ON public.billing_account FOR EACH ROW EXECUTE FUNCTION public.audit_capture('student_id');
CREATE TRIGGER billing_charge_audit AFTER INSERT OR DELETE OR UPDATE ON public.billing_charge FOR EACH ROW EXECUTE FUNCTION public.audit_capture('id');
CREATE TRIGGER billing_document_sequence_audit AFTER INSERT OR DELETE OR UPDATE ON public.billing_document_sequence FOR EACH ROW EXECUTE FUNCTION public.audit_capture('prefix', 'season_year');
CREATE TRIGGER billing_payment_audit AFTER INSERT OR DELETE OR UPDATE ON public.billing_payment FOR EACH ROW EXECUTE FUNCTION public.audit_capture('id');
CREATE TRIGGER billing_settings_audit AFTER INSERT OR DELETE OR UPDATE ON public.billing_settings FOR EACH ROW EXECUTE FUNCTION public.audit_capture('id');
CREATE TRIGGER classes_enrolment_audit AFTER INSERT OR DELETE OR UPDATE ON public.classes_enrolment FOR EACH ROW EXECUTE FUNCTION public.audit_capture('id');
CREATE TRIGGER classes_group_audit AFTER INSERT OR DELETE OR UPDATE ON public.classes_group FOR EACH ROW EXECUTE FUNCTION public.audit_capture('id');
CREATE TRIGGER identity_user_audit AFTER INSERT OR DELETE OR UPDATE ON public.identity_user FOR EACH ROW EXECUTE FUNCTION public.audit_capture('id');
CREATE TRIGGER payroll_proposed_month_audit AFTER INSERT OR DELETE OR UPDATE ON public.payroll_proposed_month FOR EACH ROW EXECUTE FUNCTION public.audit_capture('month');
CREATE TRIGGER payroll_session_audit AFTER INSERT OR DELETE OR UPDATE ON public.payroll_session FOR EACH ROW EXECUTE FUNCTION public.audit_capture('id');
CREATE TRIGGER payroll_settlement_audit AFTER INSERT OR DELETE OR UPDATE ON public.payroll_settlement FOR EACH ROW EXECUTE FUNCTION public.audit_capture('teacher_id', 'month');
CREATE TRIGGER students_student_audit AFTER INSERT OR DELETE OR UPDATE ON public.students_student FOR EACH ROW EXECUTE FUNCTION public.audit_capture('id');
CREATE TRIGGER teachers_teacher_audit AFTER INSERT OR DELETE OR UPDATE ON public.teachers_teacher FOR EACH ROW EXECUTE FUNCTION public.audit_capture('id');
ALTER TABLE ONLY public.audit_change
    ADD CONSTRAINT audit_change_action_id_fkey FOREIGN KEY (action_id) REFERENCES public.audit_action(id);

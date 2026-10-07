-- Horas automáticas día a día, festivos, sustituciones y encargado del club (ver specs/features/profesorado).

-- Festivos: ese día no se apuntan horas solas.
CREATE TABLE public.payroll_holiday (
    holiday_date date PRIMARY KEY,
    name character varying(120) NOT NULL
);

-- Turnos de «Encargado del club» (u otra actividad fija): cada semana ese día y franja cuentan como horas.
CREATE TABLE public.payroll_duty (
    id uuid PRIMARY KEY,
    teacher_id uuid NOT NULL REFERENCES public.teachers_teacher (id),
    weekday smallint NOT NULL CHECK (weekday BETWEEN 1 AND 7),
    start_minutes integer NOT NULL,
    end_minutes integer NOT NULL CHECK (end_minutes > start_minutes),
    label character varying(120) NOT NULL
);

-- Sustituciones planificadas: ese día la clase la da otro profesor.
CREATE TABLE public.payroll_substitution (
    id uuid PRIMARY KEY,
    group_id uuid NOT NULL REFERENCES public.classes_group (id) ON DELETE CASCADE,
    substitution_date date NOT NULL,
    teacher_id uuid NOT NULL REFERENCES public.teachers_teacher (id),
    reason character varying(200),
    UNIQUE (group_id, substitution_date)
);

-- Días cuyas horas ya se apuntaron solas (lo que se borre después no vuelve a aparecer).
CREATE TABLE public.payroll_proposed_day (
    proposed_date date PRIMARY KEY
);

-- Hora de inicio (para no contar dos veces horas que se solapan) y origen de las sesiones automáticas.
ALTER TABLE public.payroll_session
  ADD COLUMN start_minutes integer,
  ADD COLUMN source character varying(60);

UPDATE public.payroll_session s
   SET source = 'group:' || s.group_id, start_minutes = g.start_minutes
  FROM public.classes_group g
 WHERE s.from_schedule AND s.group_id = g.id;

-- Hasta ahora se proponía el mes entero de golpe: las sesiones futuras se quitan (se apuntarán solas al acabar cada
-- clase), salvo las de liquidaciones ya pagadas.
DELETE FROM public.payroll_session s
 WHERE s.from_schedule AND s.session_date >= CURRENT_DATE
   AND NOT EXISTS (SELECT 1 FROM public.payroll_settlement st
                    WHERE st.teacher_id = s.teacher_id AND st.month = to_char(s.session_date, 'YYYY-MM'));

-- Los días ya pasados de los meses propuestos cuentan como propuestos.
INSERT INTO public.payroll_proposed_day (proposed_date)
SELECT d::date
  FROM public.payroll_proposed_month pm,
       generate_series(to_date(pm.month || '-01', 'YYYY-MM-DD'),
                       LEAST(to_date(pm.month || '-01', 'YYYY-MM-DD') + interval '1 month' - interval '1 day',
                             CURRENT_DATE - 1),
                       interval '1 day') d
ON CONFLICT DO NOTHING;

CREATE TRIGGER payroll_holiday_audit AFTER INSERT OR DELETE OR UPDATE ON public.payroll_holiday
  FOR EACH ROW EXECUTE FUNCTION public.audit_capture('holiday_date');
CREATE TRIGGER payroll_duty_audit AFTER INSERT OR DELETE OR UPDATE ON public.payroll_duty
  FOR EACH ROW EXECUTE FUNCTION public.audit_capture('id');
CREATE TRIGGER payroll_substitution_audit AFTER INSERT OR DELETE OR UPDATE ON public.payroll_substitution
  FOR EACH ROW EXECUTE FUNCTION public.audit_capture('id');

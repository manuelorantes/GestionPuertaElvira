-- Un alumno puede darse de baja y volver a darse de alta varias veces. En students_student quedan su última alta y su
-- última baja (el periodo en curso); los periodos anteriores, ya cerrados, se guardan aquí.
CREATE TABLE public.students_past_membership (
    student_id uuid NOT NULL REFERENCES public.students_student (id) ON DELETE CASCADE,
    joined_on date NOT NULL,
    withdrawn_on date NOT NULL CHECK (withdrawn_on >= joined_on),
    PRIMARY KEY (student_id, joined_on)
);

CREATE TRIGGER students_past_membership_audit AFTER INSERT OR DELETE OR UPDATE ON public.students_past_membership
  FOR EACH ROW EXECUTE FUNCTION public.audit_capture('student_id', 'joined_on');

-- Si un alumno estuvo de alta algún día entre dos fechas (ambas incluidas), en cualquiera de sus periodos.
CREATE FUNCTION public.student_active_between(student uuid, from_day date, to_day date) RETURNS boolean
  LANGUAGE sql STABLE AS $$
    SELECT EXISTS (
             SELECT 1 FROM public.students_student s
              WHERE s.id = student AND s.joined_on <= to_day
                AND (s.withdrawn_on IS NULL OR s.withdrawn_on > from_day))
        OR EXISTS (
             SELECT 1 FROM public.students_past_membership p
              WHERE p.student_id = student AND p.joined_on <= to_day AND p.withdrawn_on > from_day)
  $$;

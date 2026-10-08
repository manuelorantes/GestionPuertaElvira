-- Asistencia: la lista de cada clase y día (la pasa quien da la clase) o la clase dada por buena sin lista
-- (administración, cuando acabó el plazo sin pasarla). Los ausentes van aparte; el resto de la lista de ese día vino.
CREATE TABLE public.attendance_roll_call (
    group_id uuid NOT NULL REFERENCES public.classes_group (id) ON DELETE CASCADE,
    roll_date date NOT NULL,
    kind character varying(20) NOT NULL CHECK (kind IN ('taken', 'confirmed')),
    taken_by_teacher uuid REFERENCES public.teachers_teacher (id) ON DELETE SET NULL,
    taken_by_user uuid REFERENCES public.identity_user (id) ON DELETE SET NULL,
    taken_at timestamp(0) with time zone NOT NULL,
    PRIMARY KEY (group_id, roll_date)
);

CREATE TABLE public.attendance_absence (
    group_id uuid NOT NULL,
    roll_date date NOT NULL,
    student_id uuid NOT NULL REFERENCES public.students_student (id) ON DELETE CASCADE,
    PRIMARY KEY (group_id, roll_date, student_id),
    FOREIGN KEY (group_id, roll_date) REFERENCES public.attendance_roll_call (group_id, roll_date) ON DELETE CASCADE
);

CREATE INDEX attendance_absence_student ON public.attendance_absence (student_id);

-- Primer día que cuenta para las listas sin pasar: no se avisa de todo lo anterior a la función.
CREATE TABLE public.attendance_settings (
    id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    since date NOT NULL
);
INSERT INTO public.attendance_settings (id, since) VALUES (1, CURRENT_DATE);

CREATE TRIGGER attendance_roll_call_audit AFTER INSERT OR DELETE OR UPDATE ON public.attendance_roll_call
  FOR EACH ROW EXECUTE FUNCTION public.audit_capture('group_id', 'roll_date');
CREATE TRIGGER attendance_absence_audit AFTER INSERT OR DELETE OR UPDATE ON public.attendance_absence
  FOR EACH ROW EXECUTE FUNCTION public.audit_capture('group_id', 'roll_date', 'student_id');

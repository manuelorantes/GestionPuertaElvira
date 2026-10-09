-- Asistencia especial: alumnos de fuera de una clase que vinieron un día (a recuperar o por otro motivo).
CREATE TABLE public.attendance_guest (
    group_id uuid NOT NULL,
    roll_date date NOT NULL,
    student_id uuid NOT NULL REFERENCES public.students_student (id) ON DELETE CASCADE,
    PRIMARY KEY (group_id, roll_date, student_id),
    FOREIGN KEY (group_id, roll_date) REFERENCES public.attendance_roll_call (group_id, roll_date) ON DELETE CASCADE
);

CREATE INDEX attendance_guest_student ON public.attendance_guest (student_id);

CREATE TRIGGER attendance_guest_audit AFTER INSERT OR DELETE OR UPDATE ON public.attendance_guest
  FOR EACH ROW EXECUTE FUNCTION public.audit_capture('group_id', 'roll_date', 'student_id');

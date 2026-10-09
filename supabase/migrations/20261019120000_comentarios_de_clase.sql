-- Comentarios de una clase un día: de la clase en sí (student_id nulo) o de un alumno de esa clase.
-- Los escribe quien da la clase (written_by_teacher, y su cuenta) o administración (solo la cuenta).
CREATE TABLE public.attendance_comment (
    id uuid PRIMARY KEY,
    group_id uuid NOT NULL REFERENCES public.classes_group (id) ON DELETE CASCADE,
    class_date date NOT NULL,
    student_id uuid REFERENCES public.students_student (id) ON DELETE CASCADE,
    body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
    written_by_teacher uuid REFERENCES public.teachers_teacher (id) ON DELETE SET NULL,
    written_by_user uuid REFERENCES public.identity_user (id) ON DELETE SET NULL,
    written_at timestamp(0) with time zone NOT NULL,
    updated_at timestamp(0) with time zone NOT NULL
);

CREATE INDEX attendance_comment_class ON public.attendance_comment (group_id, class_date);
CREATE INDEX attendance_comment_student ON public.attendance_comment (student_id) WHERE student_id IS NOT NULL;

CREATE TRIGGER attendance_comment_audit AFTER INSERT OR DELETE OR UPDATE ON public.attendance_comment
  FOR EACH ROW EXECUTE FUNCTION public.audit_capture('id');

-- Listas sin pasar por cuenta: cada administrador ve el aviso de una clase (o actividad del club) sin lista hasta que
-- él mismo la revisa («Se dio» o «Visto»), aunque otro ya la diera por buena.
CREATE TABLE public.attendance_missed_review (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.identity_user (id) ON DELETE CASCADE,
    group_id uuid REFERENCES public.classes_group (id) ON DELETE CASCADE,
    duty_id uuid REFERENCES public.payroll_duty (id) ON DELETE CASCADE,
    class_date date NOT NULL,
    reviewed_at timestamp(0) with time zone NOT NULL,
    CHECK ((group_id IS NULL) <> (duty_id IS NULL))
);
CREATE UNIQUE INDEX attendance_missed_review_once
    ON public.attendance_missed_review (user_id, COALESCE(group_id, duty_id), class_date);
ALTER TABLE public.attendance_missed_review ENABLE ROW LEVEL SECURITY;

-- Quien ya dio por buena una clase o actividad ya la revisó.
INSERT INTO public.attendance_missed_review (user_id, group_id, class_date, reviewed_at)
SELECT taken_by_user, group_id, roll_date, taken_at
  FROM public.attendance_roll_call
 WHERE kind = 'confirmed' AND taken_by_user IS NOT NULL;
INSERT INTO public.attendance_missed_review (user_id, duty_id, class_date, reviewed_at)
SELECT taken_by_user, duty_id, check_date, taken_at
  FROM public.attendance_activity_check
 WHERE kind = 'confirmed' AND taken_by_user IS NOT NULL;

CREATE TRIGGER attendance_missed_review_audit AFTER INSERT OR DELETE OR UPDATE ON public.attendance_missed_review
  FOR EACH ROW EXECUTE FUNCTION public.audit_capture('id');

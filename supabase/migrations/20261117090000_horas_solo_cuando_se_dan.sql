-- Las horas ya no se apuntan solas cada noche: solo cuando alguien confirma que la clase o la actividad se dio (lista,
-- «Turno hecho», marcas de los viernes, «Se dio» o a mano). «Listas sin pasar» sale del horario y recuerda aquí lo que
-- administración marcó como no dado («No se dio»), para que no vuelva a salir en el aviso de nadie.
CREATE TABLE public.attendance_not_given (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id uuid REFERENCES public.classes_group (id) ON DELETE CASCADE,
    duty_id uuid REFERENCES public.payroll_duty (id) ON DELETE CASCADE,
    class_date date NOT NULL,
    marked_by_user uuid REFERENCES public.identity_user (id) ON DELETE SET NULL,
    marked_at timestamp(0) with time zone NOT NULL,
    CHECK ((group_id IS NULL) <> (duty_id IS NULL))
);
CREATE UNIQUE INDEX attendance_not_given_once
    ON public.attendance_not_given (COALESCE(group_id, duty_id), class_date);
ALTER TABLE public.attendance_not_given ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER attendance_not_given_audit AFTER INSERT OR DELETE OR UPDATE ON public.attendance_not_given
  FOR EACH ROW EXECUTE FUNCTION public.audit_capture('id');

-- El registro de días ya apuntados por la tarea de la noche ya no hace falta.
DROP TABLE public.payroll_proposed_day;
DROP TABLE public.payroll_proposed_month;

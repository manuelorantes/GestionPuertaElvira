-- Actividades del club: los turnos con encargado fijo tienen un tipo. Un turno normal lo confirma su encargado («Turno
-- hecho»); la actividad de los viernes, marcando la asistencia de los viernes de los puntos. El encargado del club de
-- los viernes pasa a ser la actividad «Viernes».
ALTER TABLE public.payroll_duty
  ADD COLUMN kind character varying(20) NOT NULL DEFAULT 'shift' CHECK (kind IN ('shift', 'fridays'));

UPDATE public.payroll_duty SET kind = 'fridays', label = 'Viernes'
 WHERE weekday = 5 AND label = 'Encargado del club';

-- Confirmación de una actividad un día: «Turno hecho» de su encargado (done) o «Se dio» de administración (confirmed)
-- cuando acabó el plazo sin que el encargado la confirmara.
CREATE TABLE public.attendance_activity_check (
    duty_id uuid NOT NULL REFERENCES public.payroll_duty (id) ON DELETE CASCADE,
    check_date date NOT NULL,
    kind character varying(20) NOT NULL CHECK (kind IN ('done', 'confirmed')),
    taken_by_teacher uuid REFERENCES public.teachers_teacher (id) ON DELETE SET NULL,
    taken_by_user uuid REFERENCES public.identity_user (id) ON DELETE SET NULL,
    taken_at timestamp(0) with time zone NOT NULL,
    PRIMARY KEY (duty_id, check_date)
);

CREATE TRIGGER attendance_activity_check_audit AFTER INSERT OR DELETE OR UPDATE ON public.attendance_activity_check
  FOR EACH ROW EXECUTE FUNCTION public.audit_capture('duty_id', 'check_date');

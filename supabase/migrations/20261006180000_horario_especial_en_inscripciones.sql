-- Horario propio de una inscripción dentro de su grupo (días a los que viene y franja), para alumnos
-- que solo van algunos días del grupo o parte de la hora. Nulo = todo el horario del grupo.
ALTER TABLE public.classes_enrolment
    ADD COLUMN attendance_days json,
    ADD COLUMN attendance_start_minutes smallint,
    ADD COLUMN attendance_end_minutes smallint;

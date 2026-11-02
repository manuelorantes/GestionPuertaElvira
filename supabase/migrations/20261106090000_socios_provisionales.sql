-- Socio provisional: ha pagado (o pagará) la cuota de socio, pero falta su hoja de inscripción.
-- No tiene número de socio hasta que se le pasa a socio: entonces recibe el siguiente de la secuencia.

ALTER TABLE public.students_student
  ADD COLUMN provisional boolean NOT NULL DEFAULT false,
  ALTER COLUMN member_number DROP NOT NULL,
  ADD CONSTRAINT students_student_member_number_check
    CHECK (provisional OR member_number IS NOT NULL);

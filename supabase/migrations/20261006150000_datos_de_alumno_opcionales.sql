-- Solo el nombre es obligatorio al dar de alta a un alumno: la fecha de nacimiento puede faltar
-- (y el teléfono de un tutor, dentro del json de tutores). Lo que falta se reclama en Datos pendientes.
ALTER TABLE public.students_student ALTER COLUMN birth_date DROP NOT NULL;

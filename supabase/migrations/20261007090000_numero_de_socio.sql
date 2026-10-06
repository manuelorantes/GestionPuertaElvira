-- Número de socio: único, en orden de alta y nunca reutilizado.
-- Lo da una secuencia (no retrocede aunque se borre o se dé de baja a un alumno; la baja conserva su
-- número). Los alumnos existentes lo reciben por fecha de alta; luego se puede repartir de otra forma
-- entre ellos (PUT /api/admin/students/member-numbers) para cuadrar con el listado del club.

CREATE SEQUENCE public.students_member_number_seq AS integer START WITH 1;

ALTER TABLE public.students_student ADD COLUMN member_number integer;

UPDATE public.students_student s
   SET member_number = n.number
  FROM (SELECT id, row_number() OVER (ORDER BY joined_on, search_name, id) AS number
          FROM public.students_student) n
 WHERE s.id = n.id;

SELECT setval(
  'public.students_member_number_seq',
  COALESCE((SELECT max(member_number) FROM public.students_student), 0) + 1,
  false
);

ALTER TABLE public.students_student
  ALTER COLUMN member_number SET DEFAULT nextval('public.students_member_number_seq'),
  ALTER COLUMN member_number SET NOT NULL;

-- Diferible: los intercambios de números (y deshacerlos desde el historial) se comprueban al confirmar.
ALTER TABLE public.students_student
  ADD CONSTRAINT students_student_member_number_key UNIQUE (member_number)
  DEFERRABLE INITIALLY DEFERRED;

ALTER SEQUENCE public.students_member_number_seq OWNED BY public.students_student.member_number;

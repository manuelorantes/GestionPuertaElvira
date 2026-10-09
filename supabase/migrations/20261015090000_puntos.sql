-- Puntos: un registro de movimientos (ganados por asistir los viernes o por la foto con la equipación oficial en un
-- torneo, ajustes a mano y canjes en los cobros). Valen solo en el mes en que se ganan. Los saldos que había en la
-- cuenta de cobro se dejan a cero (decisión del club) y se empieza con las asistencias de los viernes de septiembre.
ALTER TABLE public.billing_account DROP COLUMN points;

CREATE TABLE public.points_tournament (
    id uuid PRIMARY KEY,
    name character varying(120) NOT NULL,
    held_on date NOT NULL,
    points_per_photo smallint NOT NULL CHECK (points_per_photo BETWEEN 1 AND 20)
);

CREATE TABLE public.points_movement (
    id uuid PRIMARY KEY,
    student_id uuid NOT NULL REFERENCES public.students_student (id) ON DELETE CASCADE,
    movement_date date NOT NULL,
    delta integer NOT NULL CHECK (delta <> 0),
    kind character varying(20) NOT NULL CHECK (kind IN ('friday', 'tournament', 'manual', 'redemption')),
    -- Viernes (AAAA-MM-DD), torneo o cobro del que sale; null en los ajustes a mano.
    reference character varying(60),
    note character varying(200),
    created_by uuid REFERENCES public.identity_user (id) ON DELETE SET NULL,
    created_at timestamp(0) with time zone NOT NULL DEFAULT now()
);

-- Un viernes o un torneo dan puntos una sola vez a cada alumno.
CREATE UNIQUE INDEX points_movement_once ON public.points_movement (student_id, kind, reference)
  WHERE kind IN ('friday', 'tournament');
CREATE INDEX points_movement_student_date ON public.points_movement (student_id, movement_date);
CREATE INDEX points_movement_date ON public.points_movement (movement_date);

CREATE TRIGGER points_movement_audit AFTER INSERT OR DELETE OR UPDATE ON public.points_movement
  FOR EACH ROW EXECUTE FUNCTION public.audit_capture('id');
CREATE TRIGGER points_tournament_audit AFTER INSERT OR DELETE OR UPDATE ON public.points_tournament
  FOR EACH ROW EXECUTE FUNCTION public.audit_capture('id');

-- Viernes de septiembre de 2026 de la hoja del club (el 18 y el 25 no vino nadie). Se busca a cada alumno por su nombre;
-- si alguno no existe (p. ej. en una base de datos de desarrollo), no se importa.
INSERT INTO public.points_movement (id, student_id, movement_date, delta, kind, reference, note)
SELECT gen_random_uuid(), s.id, a.day::date, 1, 'friday', a.day, 'Importado de la hoja de los viernes'
  FROM (VALUES
    ('2026-09-04', 'Natan Rodriguez Raposo'),
    ('2026-09-04', 'Jose Miguel Garcia Ramos'),
    ('2026-09-04', 'Jose Manuel Morales de la Rosa'),
    ('2026-09-11', 'Santiago Fdez. Hernandez'),
    ('2026-09-11', 'Alberto Rodriguez Garcia'),
    ('2026-09-11', 'Emilio Pauli Martinez Lopez'),
    ('2026-09-11', 'Jose Manuel Morales de la Rosa'),
    ('2026-09-11', 'Sergei Cherepukhin'),
    ('2026-09-11', 'Beltran Torres Martinez')
  ) AS a (day, name)
  JOIN public.students_student s ON s.full_name = a.name;

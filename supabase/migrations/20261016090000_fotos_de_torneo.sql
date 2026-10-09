-- Fotos de torneo en vez de torneos: se adjunta la foto de un alumno con la equipación oficial y gana sus puntos en el
-- mes de la foto (la imagen va al almacén de documentos). No había torneos ni fotos en producción.
DELETE FROM public.points_movement WHERE kind = 'tournament';
DROP TABLE public.points_tournament;

CREATE TABLE public.points_photo (
    id uuid PRIMARY KEY,
    student_id uuid NOT NULL REFERENCES public.students_student (id) ON DELETE CASCADE,
    taken_on date NOT NULL,
    note character varying(120),
    document_key character varying(200) NOT NULL,
    mime_type character varying(60) NOT NULL,
    created_at timestamp(0) with time zone NOT NULL DEFAULT now()
);

CREATE INDEX points_photo_taken_on ON public.points_photo (taken_on);

CREATE TRIGGER points_photo_audit AFTER INSERT OR DELETE OR UPDATE ON public.points_photo
  FOR EACH ROW EXECUTE FUNCTION public.audit_capture('id');

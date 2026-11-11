-- Certificados de matrícula de los alumnos: cada uno guarda lo que certificó (nombre, DNI, curso, horario…) para poder
-- volver a imprimirlo igual. El firmante por defecto y su firma escaneada (en el almacén de documentos) son configurables.
CREATE TABLE public.students_certificate (
    id uuid PRIMARY KEY,
    student_id uuid NOT NULL REFERENCES public.students_student (id) ON DELETE CASCADE,
    student_name character varying(120) NOT NULL,
    national_id character varying(9) NOT NULL,
    season character varying(9) NOT NULL,
    schedule character varying(300) NOT NULL,
    member_since date NOT NULL,
    place character varying(80) NOT NULL,
    issued_on date NOT NULL,
    signer_name character varying(120) NOT NULL,
    signer_role character varying(80) NOT NULL,
    signed boolean NOT NULL,
    issued_by uuid,
    created_at timestamp(0) with time zone NOT NULL DEFAULT now()
);
CREATE INDEX students_certificate_student_idx ON public.students_certificate (student_id);
ALTER TABLE public.students_certificate ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER students_certificate_audit AFTER INSERT OR DELETE OR UPDATE ON public.students_certificate
  FOR EACH ROW EXECUTE FUNCTION public.audit_capture('id');

CREATE TABLE public.students_certificate_settings (
    id smallint PRIMARY KEY CHECK (id = 1),
    signer_name character varying(120) NOT NULL,
    signer_role character varying(80) NOT NULL,
    signature_key character varying(200),
    signature_mime_type character varying(60)
);
ALTER TABLE public.students_certificate_settings ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER students_certificate_settings_audit AFTER INSERT OR DELETE OR UPDATE ON public.students_certificate_settings
  FOR EACH ROW EXECUTE FUNCTION public.audit_capture('id');
INSERT INTO public.students_certificate_settings (id, signer_name, signer_role)
  VALUES (1, 'Manuel Orantes Taboada', 'Presidente');

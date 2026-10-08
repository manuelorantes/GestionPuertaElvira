-- Anticipos a profesores: dinero pagado a cuenta de la liquidación de un mes (o pagado de más, que se descuenta de un
-- mes posterior). En Contabilidad cuentan como gasto el día que se pagan; la liquidación de ese mes resta el anticipo.
CREATE TABLE public.payroll_advance (
    id uuid PRIMARY KEY,
    teacher_id uuid NOT NULL REFERENCES public.teachers_teacher (id),
    month character varying(7) NOT NULL,
    amount_cents integer NOT NULL CHECK (amount_cents > 0),
    paid_on date NOT NULL,
    note character varying(200)
);

CREATE INDEX payroll_advance_teacher ON public.payroll_advance (teacher_id);
CREATE INDEX payroll_advance_month ON public.payroll_advance (month);

CREATE TRIGGER payroll_advance_audit AFTER INSERT OR DELETE OR UPDATE ON public.payroll_advance
  FOR EACH ROW EXECUTE FUNCTION public.audit_capture('id');

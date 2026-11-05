-- A qué alumnos paga cada remitente de transferencias, según lo que se casó con ellas al conciliar con el banco: la
-- próxima transferencia suya propone los cobros o las cuotas de esos alumnos (ver conciliacion-bancaria-con-extracto.md).
CREATE TABLE public.accounting_bank_payer (
    counterparty varchar(120) NOT NULL,
    student_id uuid NOT NULL REFERENCES public.students_student (id) ON DELETE CASCADE,
    PRIMARY KEY (counterparty, student_id)
);
CREATE INDEX accounting_bank_payer_student_idx ON public.accounting_bank_payer (student_id);
ALTER TABLE public.accounting_bank_payer ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER accounting_bank_payer_audit AFTER INSERT OR DELETE OR UPDATE ON public.accounting_bank_payer
  FOR EACH ROW EXECUTE FUNCTION public.audit_capture('counterparty', 'student_id');

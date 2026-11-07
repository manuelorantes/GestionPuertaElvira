-- Tarifa propia de una clase para quien la dé (su profesor o un sustituto): por hora o por sesión, en lugar de la tarifa
-- por hora del profesor. Solo superadministración la cambia.
-- Decisión: specs/decisions/tarifa-propia-de-clases-para-el-profesorado.md
CREATE TABLE public.payroll_group_pay (
    group_id uuid PRIMARY KEY REFERENCES public.classes_group (id) ON DELETE CASCADE,
    unit text NOT NULL CHECK (unit IN ('hour', 'session')),
    amount_cents integer NOT NULL CHECK (amount_cents >= 0)
);

ALTER TABLE public.payroll_group_pay ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER payroll_group_pay_audit AFTER INSERT OR DELETE OR UPDATE ON public.payroll_group_pay
  FOR EACH ROW EXECUTE FUNCTION public.audit_capture('group_id');

-- Conciliación con el extracto del banco: qué movimiento del extracto corresponde a qué de la app (cobros, gastos,
-- apuntes o traspasos) y la categoría elegida para cada contraparte. Las sugerencias no se guardan: se calculan en cada
-- pasada (ver conciliacion-bancaria-con-extracto.md).
CREATE TABLE public.accounting_bank_match (
    movement_key varchar(60) PRIMARY KEY,
    operation_date date NOT NULL,
    amount_cents integer NOT NULL,
    concept varchar(200) NOT NULL,
    targets jsonb NOT NULL
);
ALTER TABLE public.accounting_bank_match ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER accounting_bank_match_audit AFTER INSERT OR DELETE OR UPDATE ON public.accounting_bank_match
  FOR EACH ROW EXECUTE FUNCTION public.audit_capture('movement_key');

CREATE TABLE public.accounting_bank_rule (
    counterparty varchar(120) PRIMARY KEY,
    category varchar(40) NOT NULL
);
ALTER TABLE public.accounting_bank_rule ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER accounting_bank_rule_audit AFTER INSERT OR DELETE OR UPDATE ON public.accounting_bank_rule
  FOR EACH ROW EXECUTE FUNCTION public.audit_capture('counterparty');

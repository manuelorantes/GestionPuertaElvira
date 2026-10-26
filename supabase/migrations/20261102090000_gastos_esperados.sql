-- Gastos esperados: lo que el club espera pagar cada mes (alquiler, limpieza, presidencia…) con lo que suele costar.
-- Se esperan en sus meses del año (1 a 12) desde el mes `since`. Lo que costaron de verdad es el apunte con que se pagó.
CREATE TABLE public.accounting_expected_expense (
    id uuid PRIMARY KEY,
    concept varchar(120) NOT NULL CHECK (char_length(concept) >= 1),
    category varchar(20) NOT NULL,
    amount_cents integer NOT NULL CHECK (amount_cents > 0),
    months jsonb NOT NULL CHECK (jsonb_typeof(months) = 'array'),
    since varchar(7) NOT NULL CHECK (since ~ '^\d{4}-\d{2}$')
);
ALTER TABLE public.accounting_expected_expense ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER accounting_expected_expense_audit AFTER INSERT OR DELETE OR UPDATE ON public.accounting_expected_expense
  FOR EACH ROW EXECUTE FUNCTION public.audit_capture('id');

-- Cómo quedó cada mes de un gasto esperado: pagado con un apunte o, sin apunte, «No hay este mes». Sin fila, pendiente.
-- Quitar el apunte borra la fila y el mes vuelve a estar pendiente.
CREATE TABLE public.accounting_expected_month (
    expected_expense_id uuid NOT NULL REFERENCES public.accounting_expected_expense (id) ON DELETE CASCADE,
    period varchar(7) NOT NULL CHECK (period ~ '^\d{4}-\d{2}$'),
    entry_id uuid UNIQUE REFERENCES public.accounting_entry (id) ON DELETE CASCADE,
    PRIMARY KEY (expected_expense_id, period)
);
ALTER TABLE public.accounting_expected_month ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER accounting_expected_month_audit AFTER INSERT OR DELETE OR UPDATE ON public.accounting_expected_month
  FOR EACH ROW EXECUTE FUNCTION public.audit_capture('expected_expense_id', 'period');

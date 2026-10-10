-- Correcciones en contabilidad de movimientos que vienen de Cobros o de Profesorado (cobros, liquidaciones, anticipos):
-- cambian cómo salen en el libro, no el cobro ni la nómina. `method` NULL: la del movimiento.
CREATE TABLE public.accounting_correction (
    source varchar(20) NOT NULL CHECK (source IN ('payment', 'settlement', 'advance')),
    source_id varchar(80) NOT NULL,
    concept varchar(200) NOT NULL CHECK (char_length(concept) >= 1),
    category varchar(20) NOT NULL,
    method varchar(10),
    amount_cents integer NOT NULL CHECK (amount_cents > 0),
    period varchar(7) NOT NULL CHECK (period ~ '^\d{4}-\d{2}$'),
    PRIMARY KEY (source, source_id)
);
CREATE TRIGGER accounting_correction_audit AFTER INSERT OR DELETE OR UPDATE ON public.accounting_correction
  FOR EACH ROW EXECUTE FUNCTION public.audit_capture('source', 'source_id');

-- Mes al que corresponde cada apunte y factura (la luz de septiembre pagada en octubre). NULL: el de su fecha.
ALTER TABLE public.accounting_entry ADD COLUMN period varchar(7) CHECK (period ~ '^\d{4}-\d{2}$');
ALTER TABLE public.accounting_invoice ADD COLUMN period varchar(7) CHECK (period ~ '^\d{4}-\d{2}$');

-- Ajustes de contabilidad (una sola fila): las categorías que cuentan como ingresos y gastos «del mes» en el resumen.
-- Sin fila, las de por defecto (ver el dominio).
CREATE TABLE public.accounting_settings (
    id smallint PRIMARY KEY CHECK (id = 1),
    monthly_categories jsonb NOT NULL
);
CREATE TRIGGER accounting_settings_audit AFTER INSERT OR DELETE OR UPDATE ON public.accounting_settings
  FOR EACH ROW EXECUTE FUNCTION public.audit_capture('id');

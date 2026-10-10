-- Categorías del libro creadas por el club (las de serie viven en el código). `code` no cambia aunque se renombre.
CREATE TABLE public.accounting_category (
    code varchar(20) PRIMARY KEY,
    kind varchar(10) NOT NULL CHECK (kind IN ('income', 'expense')),
    label varchar(40) NOT NULL CHECK (char_length(label) >= 1)
);
CREATE TRIGGER accounting_category_audit AFTER INSERT OR DELETE OR UPDATE ON public.accounting_category
  FOR EACH ROW EXECUTE FUNCTION public.audit_capture('code');

-- Precios que fija superadministración (ver specs/decisions/precio-de-clases-especiales-y-de-alumnos.md):
-- el precio mensual de una clase especial (quien está en ella paga ese precio y sus horas no cuentan para el tramo)
-- y el precio mensual fijado a un alumno, que manda sobre todo lo demás.
CREATE TABLE public.billing_special_class_price (
    group_id uuid PRIMARY KEY REFERENCES public.classes_group (id) ON DELETE CASCADE,
    monthly_price_cents integer NOT NULL CHECK (monthly_price_cents >= 0)
);
ALTER TABLE public.billing_special_class_price ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER billing_special_class_price_audit AFTER INSERT OR DELETE OR UPDATE ON public.billing_special_class_price
  FOR EACH ROW EXECUTE FUNCTION public.audit_capture('group_id');

ALTER TABLE public.billing_account
    ADD COLUMN fixed_price_cents integer CHECK (fixed_price_cents >= 0);

-- Material deportivo (ver specs/decisions/material-deportivo-como-cobro.md): productos con campos propios, pedidos de
-- cada alumno (que generan una cuota de tipo «material») y compras al proveedor por lotes. El stock se calcula al leer.

-- Productos: `fields` = [{id, name, kind: options|text, options: [..]}].
CREATE TABLE public.equipment_product (
    id uuid PRIMARY KEY,
    name varchar(60) NOT NULL CHECK (char_length(name) >= 1),
    price_cents integer NOT NULL CHECK (price_cents >= 0),
    fields jsonb NOT NULL DEFAULT '[]'::jsonb,
    active boolean NOT NULL DEFAULT true
);

-- Pedidos: `field_values` por id de campo; `variant_key` = JSON canónico de los campos de lista (para el stock).
-- `charge_id`: la cuota que se generó al pasar a pedido. «Pagado» sale de que esa cuota esté cubierta.
CREATE TABLE public.equipment_order (
    id uuid PRIMARY KEY,
    student_id uuid NOT NULL REFERENCES public.students_student (id) ON DELETE CASCADE,
    product_id uuid NOT NULL REFERENCES public.equipment_product (id),
    quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 999),
    field_values jsonb NOT NULL DEFAULT '{}'::jsonb,
    variant_key text NOT NULL,
    variant_label text NOT NULL,
    detail text NOT NULL,
    note varchar(300),
    status varchar(10) NOT NULL CHECK (status IN ('reserved', 'ordered', 'cancelled')),
    price_cents integer CHECK (price_cents IS NULL OR price_cents >= 0),
    charge_id uuid REFERENCES public.billing_charge (id),
    created_on date NOT NULL,
    ordered_on date,
    delivered_on date,
    cancelled_on date,
    returned_to_stock boolean NOT NULL DEFAULT false,
    CONSTRAINT equipment_order_priced CHECK ((price_cents IS NULL) = (charge_id IS NULL))
);

CREATE INDEX equipment_order_student ON public.equipment_order (student_id);
CREATE INDEX equipment_order_product ON public.equipment_order (product_id, variant_key);

-- Compras por lotes: `lines` = [{variantKey, variantLabel, values, quantity}]; el coste es el del lote entero.
CREATE TABLE public.equipment_purchase (
    id uuid PRIMARY KEY,
    product_id uuid NOT NULL REFERENCES public.equipment_product (id),
    bought_on date NOT NULL,
    cost_cents integer NOT NULL CHECK (cost_cents >= 0),
    lines jsonb NOT NULL,
    note varchar(300)
);

CREATE INDEX equipment_purchase_product ON public.equipment_purchase (product_id);

CREATE TRIGGER equipment_product_audit AFTER INSERT OR DELETE OR UPDATE ON public.equipment_product
  FOR EACH ROW EXECUTE FUNCTION public.audit_capture('id');
CREATE TRIGGER equipment_order_audit AFTER INSERT OR DELETE OR UPDATE ON public.equipment_order
  FOR EACH ROW EXECUTE FUNCTION public.audit_capture('id');
CREATE TRIGGER equipment_purchase_audit AFTER INSERT OR DELETE OR UPDATE ON public.equipment_purchase
  FOR EACH ROW EXECUTE FUNCTION public.audit_capture('id');

-- Cuotas de material: concepto propio y varias por alumno y mes (el índice único deja de aplicarles).
ALTER TABLE public.billing_charge ADD COLUMN concept text;
DROP INDEX public.billing_charge_unique;
CREATE UNIQUE INDEX billing_charge_unique ON public.billing_charge (student_id, kind, period)
  WHERE kind <> 'material';

-- Un cobro de material cubre solo la cuota de su pedido.
ALTER TABLE public.billing_payment
  ADD COLUMN charge_id uuid REFERENCES public.billing_charge (id),
  ADD CONSTRAINT billing_payment_material_charge CHECK ((kind = 'material') = (charge_id IS NOT NULL));
CREATE INDEX billing_payment_charge ON public.billing_payment (charge_id) WHERE charge_id IS NOT NULL;

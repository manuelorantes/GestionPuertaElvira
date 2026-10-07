-- Cuotas separadas de los cobros (ver specs/decisions/cuotas-separadas-de-los-cobros.md).
-- Una cuota puede fijarse a mano con un motivo; el recálculo automático no la toca.
ALTER TABLE public.billing_charge
  ADD COLUMN manual boolean NOT NULL DEFAULT false,
  ADD COLUMN note character varying(160);

-- Lo que cubre cada cobro en importes de cuota (antes de descuentos). Hasta ahora, la suma de las cuotas que
-- pagaba más las correcciones de importe hechas después; un cobro sin cuotas ligadas cubre su total.
ALTER TABLE public.billing_payment ADD COLUMN credit_cents integer;

UPDATE public.billing_payment p
   SET credit_cents = CASE
     WHEN EXISTS (SELECT 1 FROM public.billing_charge c WHERE c.paid_by = p.id)
       THEN (SELECT SUM(c.amount_cents) FROM public.billing_charge c WHERE c.paid_by = p.id)
            + COALESCE((SELECT SUM((l ->> 'amountCents')::integer)
                          FROM jsonb_array_elements(p.lines::jsonb) l
                         WHERE l ->> 'label' LIKE 'Corrección: %'), 0)
     ELSE p.total_cents
   END;

ALTER TABLE public.billing_payment ALTER COLUMN credit_cents SET NOT NULL;

-- Descuento por pago adelantado fijado en cada cuota (ver cuotas-separadas-de-los-cobros.md): el importe de la cuota
-- ya lo lleva descontado y se conserva al recalcular.
ALTER TABLE public.billing_charge ADD COLUMN discount_percent smallint NOT NULL DEFAULT 0;

-- Cobros adelantados hechos en la aplicación: su recibo dice el porcentaje («Pago adelantado 3 meses −10 %»,
-- «Pago de todo el año −20 %»).
CREATE TEMPORARY TABLE prepaid_payment AS
SELECT p.id, MAX((regexp_match(l ->> 'label', '−\s*(\d+)\s*%'))[1])::smallint AS percent
  FROM public.billing_payment p, jsonb_array_elements(p.lines::jsonb) l
 WHERE p.kind = 'monthly'
   AND (l ->> 'label' LIKE 'Pago adelantado % meses −%' OR l ->> 'label' LIKE 'Pago de todo el año −%')
 GROUP BY p.id;

-- Sus cuotas pasan a llevar el descuento descontado…
UPDATE public.billing_charge c
   SET discount_percent = pp.percent,
       amount_cents = c.amount_cents - ROUND(c.amount_cents * pp.percent / 100.0)::integer
  FROM prepaid_payment pp
 WHERE c.paid_by = pp.id AND NOT c.manual AND c.discount_percent = 0 AND pp.percent > 0;

-- …y lo que cubre cada uno de esos cobros se ajusta igual (suma de sus cuotas más las correcciones de importe).
UPDATE public.billing_payment p
   SET credit_cents = (SELECT SUM(c.amount_cents) FROM public.billing_charge c WHERE c.paid_by = p.id)
       + COALESCE((SELECT SUM((l ->> 'amountCents')::integer)
                     FROM jsonb_array_elements(p.lines::jsonb) l
                    WHERE l ->> 'label' LIKE 'Corrección: %'), 0)
 WHERE p.id IN (SELECT id FROM prepaid_payment)
   AND EXISTS (SELECT 1 FROM public.billing_charge c WHERE c.paid_by = p.id);

DROP TABLE prepaid_payment;

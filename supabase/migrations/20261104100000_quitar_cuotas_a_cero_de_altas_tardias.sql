-- Antes de poder dejar un mes sin cuota, dos altas que empezaron a pagar más tarde se apañaron con una cuota de 0 €
-- fijada a mano. Esas cuotas dejan de existir y sus cobros pasan al mes que de verdad cubren. Solo se tocan si siguen
-- como se dejaron (en cualquier otra base de datos no existen y no hace nada).

-- Empezó a venir en octubre: sin cuota de septiembre; su cobro de 35 € es el de octubre.
DELETE FROM public.billing_charge
 WHERE id = '01a1136d-9ca7-7fae-a675-585442de41a1' AND kind = 'monthly' AND period = '2026-09'
   AND amount_cents = 0 AND manual;
UPDATE public.billing_payment SET periods = '["2026-10"]', concept = 'Octubre 2026'
 WHERE id = '01a13b8f-e908-72c3-9285-afcc76f78c8f' AND periods::jsonb = '["2026-09"]'::jsonb;

-- Alta el 29/10, empieza a pagar en noviembre: octubre sin cuota; su cobro de 45 € es el de noviembre.
UPDATE public.billing_account SET unbilled_months = '["2026-10"]'::jsonb
 WHERE student_id = '01a188e4-23ac-7f09-83df-11df3a125a5b'
   AND EXISTS (SELECT 1 FROM public.billing_charge
                WHERE id = '01a188e4-2661-7176-a6f3-61d3617730a8' AND amount_cents = 0 AND manual);
DELETE FROM public.billing_charge
 WHERE id = '01a188e4-2661-7176-a6f3-61d3617730a8' AND kind = 'monthly' AND period = '2026-10'
   AND amount_cents = 0 AND manual;
UPDATE public.billing_payment SET periods = '["2026-11"]', concept = 'Noviembre 2026'
 WHERE id = '01a188eb-59ce-7e6c-b5b4-375189071e21' AND periods::jsonb = '["2026-10"]'::jsonb;

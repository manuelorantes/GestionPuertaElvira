-- Dos socios se dieron de baja el 12/10 (con su cuota de socio cancelada, sin nada cobrado) y volvieron a darse de alta
-- en la misma temporada. Entonces la app no recuperaba esa cuota: vuelve a deberse. Solo se tocan si siguen como se
-- dejaron (en cualquier otra base de datos no existen y no hace nada).
UPDATE public.billing_charge SET cancelled_on = NULL, kept_cents = NULL
 WHERE id IN ('01a110c0-abe0-7701-97ec-a1e62a929dff', '01a110c0-e821-758f-9c0d-abe2bd83467b')
   AND kind = 'membership' AND period = '2026-09'
   AND cancelled_on = '2026-10-12' AND kept_cents = 0 AND paid_by IS NULL;

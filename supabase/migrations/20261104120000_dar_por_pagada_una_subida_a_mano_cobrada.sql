-- Una cuota de octubre subida a mano de 40 € a 55 € y cobrada después entera (55 €) seguía con la subida marcada
-- para cubrirse lo último: entonces registrar un cobro de ese mes no la daba por pagada, y 15 € pasaban a noviembre.
-- Se quita la marca. Solo se toca si sigue como se dejó (en cualquier otra base de datos no existe y no hace nada).
UPDATE public.billing_charge SET base_cents = NULL
 WHERE id = '01a14104-c863-7acb-b9f2-bb8405b7193c' AND kind = 'monthly' AND period = '2026-10'
   AND amount_cents = 5500 AND base_cents = 4000;

-- Los movimientos de los extractos anteriores al 01/09/2026 son de antes de abrir la temporada 2026/27: no se concilian
-- y no deben salir en «Sin conciliar». Se borran los que se subieron con los extractos.
DELETE FROM public.accounting_bank_movement WHERE operation_date < DATE '2026-09-01';

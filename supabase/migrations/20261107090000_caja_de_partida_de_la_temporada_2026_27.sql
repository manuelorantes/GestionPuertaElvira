-- La caja de partida de la temporada 2026/27 es la del arqueo de caja a 31/08/2026: −1.822,81 € (no los 530,14 € de
-- enero que se pusieron al empezar). El banco sigue en 191,37 €, así que el saldo arrastrado pasa a −1.631,44 €:
-- 191,37 € de entradas menos 1.822,81 € de salidas, todo lo de caja.
-- Solo si el cierre de 2025/26 sigue con las cifras que se apuntaron al empezar a usar la app.
UPDATE public.accounting_closing
   SET income_cents = 19137,
       expense_cents = 182281,
       cash_cents = -182281
 WHERE start_year = 2025
   AND income_cents = 72151
   AND expense_cents = 0
   AND cash_cents = 53014;

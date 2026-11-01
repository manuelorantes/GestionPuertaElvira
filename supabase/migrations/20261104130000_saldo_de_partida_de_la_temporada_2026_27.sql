-- Lo que tenía el club al empezar a usar la app (31/08/2026): 191,37 € en el banco y 530,14 € en caja. Se apunta como
-- el cierre de la temporada 2025/26, que es lo que la temporada 2026/27 arrastra (saldo de partida, repartido entre
-- banco y caja). Solo si esa temporada no está cerrada ya y no tiene movimientos con fecha.
INSERT INTO public.accounting_closing (start_year, income_cents, expense_cents, cash_cents, closed_on)
SELECT 2025, 72151, 0, 53014, DATE '2026-08-31'
 WHERE NOT EXISTS (SELECT 1 FROM public.accounting_closing WHERE start_year = 2025)
   AND NOT EXISTS (SELECT 1 FROM public.billing_payment WHERE paid_on BETWEEN DATE '2025-09-01' AND DATE '2026-08-31')
   AND NOT EXISTS (SELECT 1 FROM public.accounting_entry WHERE entry_date BETWEEN DATE '2025-09-01' AND DATE '2026-08-31');

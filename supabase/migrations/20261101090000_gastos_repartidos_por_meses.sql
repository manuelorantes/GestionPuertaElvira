-- Un apunte, una factura o una corrección del libro pueden corresponder a varios meses (el IVA de un trimestre pagado
-- después): el reparto se guarda como lista de {period, amount_cents} que suma el importe. Nulo cuando todo
-- corresponde a un solo mes, el de `period` (o el de su fecha).
ALTER TABLE public.accounting_entry ADD COLUMN period_shares jsonb
  CHECK (period_shares IS NULL OR jsonb_typeof(period_shares) = 'array');
ALTER TABLE public.accounting_invoice ADD COLUMN period_shares jsonb
  CHECK (period_shares IS NULL OR jsonb_typeof(period_shares) = 'array');
ALTER TABLE public.accounting_correction ADD COLUMN period_shares jsonb
  CHECK (period_shares IS NULL OR jsonb_typeof(period_shares) = 'array');

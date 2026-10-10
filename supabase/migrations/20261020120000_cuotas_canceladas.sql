-- Cancelar una cuota: deja de deberse lo pendiente. Se guarda el día y lo que se conserva (lo ya cobrado; 0 si se
-- canceló entera). Lo que se debe es LEAST(amount_cents, kept_cents) mientras está cancelada; al reactivarla, todo.
ALTER TABLE public.billing_charge
  ADD COLUMN cancelled_on date,
  ADD COLUMN kept_cents integer CHECK (kept_cents IS NULL OR kept_cents >= 0),
  ADD CONSTRAINT billing_charge_cancellation_complete CHECK ((cancelled_on IS NULL) = (kept_cents IS NULL));

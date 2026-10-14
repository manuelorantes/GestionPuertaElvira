-- Lo que se sube a mano a una cuota se cubre lo último: se guarda el importe más bajo que tuvo antes de fijarla a mano
-- (nulo si no se ha fijado). Lo que la cuota pasa de él se reparte después de todas las demás cuotas del alumno, para
-- que lo que falte tras subirla se quede en ese mes y no en el más reciente.
ALTER TABLE public.billing_charge
  ADD COLUMN base_cents integer CHECK (base_cents IS NULL OR base_cents >= 0);

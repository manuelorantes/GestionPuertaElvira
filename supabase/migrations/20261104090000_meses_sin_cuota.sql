-- Meses de la temporada en los que a un alumno no se le cobra cuota mensual (p. ej. el de un alta a final de mes
-- en la que se decide no cobrarle nada): la tarea de la noche no le crea cuota y su primer cobro es el mes siguiente.
ALTER TABLE public.billing_account ADD COLUMN unbilled_months jsonb NOT NULL DEFAULT '[]'::jsonb;

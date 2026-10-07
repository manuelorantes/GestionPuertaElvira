-- Una sustitución puede ser de una clase o de un turno fijo (encargado del club): exactamente uno de los dos.
ALTER TABLE public.payroll_substitution
    ALTER COLUMN group_id DROP NOT NULL,
    ADD COLUMN duty_id uuid REFERENCES public.payroll_duty (id) ON DELETE CASCADE,
    ADD CONSTRAINT payroll_substitution_target CHECK ((group_id IS NULL) <> (duty_id IS NULL)),
    ADD CONSTRAINT payroll_substitution_duty_day UNIQUE (duty_id, substitution_date);

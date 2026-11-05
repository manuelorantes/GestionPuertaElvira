-- Forma de pago de las liquidaciones y los anticipos del profesorado: hasta ahora salían siempre por transferencia en
-- Contabilidad (salvo corrección en el libro). Lo ya pagado se queda como transferencia.
ALTER TABLE public.payroll_settlement
  ADD COLUMN method character varying(10) NOT NULL DEFAULT 'transfer'
  CHECK (method IN ('cash', 'transfer', 'card'));

ALTER TABLE public.payroll_advance
  ADD COLUMN method character varying(10) NOT NULL DEFAULT 'transfer'
  CHECK (method IN ('cash', 'transfer', 'card'));

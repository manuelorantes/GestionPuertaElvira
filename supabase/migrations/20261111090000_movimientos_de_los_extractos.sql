-- Los movimientos de los extractos del banco que se suben a la conciliación, para saber en cualquier momento qué hay en
-- el banco sin conciliar (lo que no está en accounting_bank_match con algo de la app). Se guardan al subir el extracto;
-- la huella es la misma que la de accounting_bank_match (ver conciliacion-bancaria-con-extracto.md).
CREATE TABLE public.accounting_bank_movement (
    movement_key varchar(60) PRIMARY KEY,
    operation_date date NOT NULL,
    value_date date NOT NULL,
    concept varchar(300) NOT NULL,
    amount_cents integer NOT NULL,
    balance_cents integer NOT NULL
);
ALTER TABLE public.accounting_bank_movement ENABLE ROW LEVEL SECURITY;

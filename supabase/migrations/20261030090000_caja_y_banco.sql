-- Caja y banco: cada movimiento del libro ya va a una cuenta por su forma de pago (efectivo → caja; transferencia
-- y tarjeta → banco). Los traspasos mueven dinero de una a otra sin cambiar lo que tiene el club.
CREATE TABLE public.accounting_transfer (
    id uuid PRIMARY KEY,
    transfer_date date NOT NULL,
    from_account varchar(4) NOT NULL CHECK (from_account IN ('bank', 'cash')),
    to_account varchar(4) NOT NULL CHECK (to_account IN ('bank', 'cash')),
    amount_cents integer NOT NULL CHECK (amount_cents > 0),
    note varchar(120) NOT NULL DEFAULT '',
    CHECK (from_account <> to_account)
);
CREATE INDEX accounting_transfer_date_idx ON public.accounting_transfer (transfer_date);
ALTER TABLE public.accounting_transfer ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER accounting_transfer_audit AFTER INSERT OR DELETE OR UPDATE ON public.accounting_transfer
  FOR EACH ROW EXECUTE FUNCTION public.audit_capture('id');

-- El cierre guarda también lo que el ejercicio movió en caja: así el saldo arrastrado se reparte entre banco y caja.
ALTER TABLE public.accounting_closing ADD COLUMN cash_cents integer NOT NULL DEFAULT 0;

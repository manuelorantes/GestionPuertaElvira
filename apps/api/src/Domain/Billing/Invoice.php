<?php

declare(strict_types=1);

namespace App\Domain\Billing;

use App\Domain\Common\LocalDate;
use App\Domain\Common\Money;

/** Factura de un cobro: el IVA está incluido en el precio y se desglosa. */
final readonly class Invoice
{
    public function __construct(
        public DocumentNumber $number,
        public LocalDate $issuedOn,
        public InvoiceCustomer $customer,
        public int $vatPercent,
        public Money $base,
        public Money $vat,
        public Money $total,
    ) {
    }

    public static function forTotal(DocumentNumber $number, LocalDate $issuedOn, InvoiceCustomer $customer, int $vatPercent, Money $total): self
    {
        $base = Money::cents((int) round($total->cents * 100 / (100 + $vatPercent)));

        return new self($number, $issuedOn, $customer, $vatPercent, $base, $total->minus($base), $total);
    }
}

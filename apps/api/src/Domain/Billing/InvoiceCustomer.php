<?php

declare(strict_types=1);

namespace App\Domain\Billing;

use App\Domain\Common\InvalidValue;

final readonly class InvoiceCustomer
{
    public function __construct(public string $name, public string $taxId, public string $address)
    {
        if ('' === trim($name) || '' === trim($taxId) || '' === trim($address)) {
            throw new InvalidValue('customer', 'Para la factura hacen falta nombre, NIF y dirección.');
        }
    }
}

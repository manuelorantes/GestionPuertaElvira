<?php

declare(strict_types=1);

namespace App\Domain\Billing\Error;

use DomainException;

final class InvoiceAlreadyIssued extends DomainException
{
    public function __construct()
    {
        parent::__construct('Este cobro ya tiene factura.');
    }
}

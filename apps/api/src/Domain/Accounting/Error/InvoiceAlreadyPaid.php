<?php

declare(strict_types=1);

namespace App\Domain\Accounting\Error;

use DomainException;

final class InvoiceAlreadyPaid extends DomainException
{
    public function __construct()
    {
        parent::__construct('Esa factura ya está pagada.');
    }
}

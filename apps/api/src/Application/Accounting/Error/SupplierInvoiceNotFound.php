<?php

declare(strict_types=1);

namespace App\Application\Accounting\Error;

use RuntimeException;

final class SupplierInvoiceNotFound extends RuntimeException
{
    public function __construct()
    {
        parent::__construct('No existe esa factura.');
    }
}

<?php

declare(strict_types=1);

namespace App\Application\Accounting\Error;

use RuntimeException;

final class InvoiceAlreadyPaidCannotBeDeleted extends RuntimeException
{
    public function __construct()
    {
        parent::__construct('Una factura pagada no se puede borrar.');
    }
}

<?php

declare(strict_types=1);

namespace App\Application\Accounting\Error;

use RuntimeException;

final class DocumentNotFound extends RuntimeException
{
    public function __construct()
    {
        parent::__construct('Esa factura no tiene documento adjunto.');
    }
}

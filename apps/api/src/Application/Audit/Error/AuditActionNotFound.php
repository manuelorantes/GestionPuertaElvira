<?php

declare(strict_types=1);

namespace App\Application\Audit\Error;

use RuntimeException;

final class AuditActionNotFound extends RuntimeException
{
    public function __construct()
    {
        parent::__construct('No existe esa acción del historial.');
    }
}

<?php

declare(strict_types=1);

namespace App\Application\Payroll\Error;

use RuntimeException;

final class SessionNotFound extends RuntimeException
{
    public function __construct()
    {
        parent::__construct('No existe esa sesión.');
    }
}

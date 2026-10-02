<?php

declare(strict_types=1);

namespace App\Application\Identity\Error;

use RuntimeException;

final class CurrentPasswordMismatch extends RuntimeException
{
    public function __construct()
    {
        parent::__construct('La contraseña actual no es correcta.');
    }
}

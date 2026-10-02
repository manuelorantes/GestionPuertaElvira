<?php

declare(strict_types=1);

namespace App\Application\Identity\Error;

use RuntimeException;

final class SessionNotValid extends RuntimeException
{
    public function __construct()
    {
        parent::__construct('La sesión no es válida o ha caducado.');
    }
}

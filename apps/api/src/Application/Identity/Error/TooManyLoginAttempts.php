<?php

declare(strict_types=1);

namespace App\Application\Identity\Error;

use RuntimeException;

final class TooManyLoginAttempts extends RuntimeException
{
    public function __construct(public readonly int $retryAfterSeconds)
    {
        parent::__construct('Demasiados intentos. Prueba más tarde.');
    }
}

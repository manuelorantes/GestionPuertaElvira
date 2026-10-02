<?php

declare(strict_types=1);

namespace App\Application\Identity\Error;

use RuntimeException;

final class UserNotFound extends RuntimeException
{
    public function __construct()
    {
        parent::__construct('No existe ninguna cuenta con ese email.');
    }
}

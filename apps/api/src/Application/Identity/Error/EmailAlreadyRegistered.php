<?php

declare(strict_types=1);

namespace App\Application\Identity\Error;

use RuntimeException;

final class EmailAlreadyRegistered extends RuntimeException
{
    public function __construct()
    {
        parent::__construct('Ya existe una cuenta con ese email.');
    }
}

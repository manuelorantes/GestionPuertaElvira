<?php

declare(strict_types=1);

namespace App\Application\Students\Error;

use RuntimeException;

final class StudentNotFound extends RuntimeException
{
    public function __construct()
    {
        parent::__construct('No existe ese alumno.');
    }
}

<?php

declare(strict_types=1);

namespace App\Application\Classes\Error;

use RuntimeException;

final class TeacherNotAvailable extends RuntimeException
{
    public function __construct()
    {
        parent::__construct('El profesor elegido no existe o no está activo.');
    }
}

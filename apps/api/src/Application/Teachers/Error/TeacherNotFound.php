<?php

declare(strict_types=1);

namespace App\Application\Teachers\Error;

use RuntimeException;

final class TeacherNotFound extends RuntimeException
{
    public function __construct()
    {
        parent::__construct('No existe ese profesor.');
    }
}

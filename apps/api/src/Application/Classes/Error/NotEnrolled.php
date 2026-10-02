<?php

declare(strict_types=1);

namespace App\Application\Classes\Error;

use RuntimeException;

final class NotEnrolled extends RuntimeException
{
    public function __construct()
    {
        parent::__construct('El alumno no está inscrito en ese grupo.');
    }
}

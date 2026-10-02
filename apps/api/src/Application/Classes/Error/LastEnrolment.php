<?php

declare(strict_types=1);

namespace App\Application\Classes\Error;

use RuntimeException;

final class LastEnrolment extends RuntimeException
{
    public function __construct()
    {
        parent::__construct('Es su único grupo: para dejarlo, da de baja al alumno o muévelo a otro grupo.');
    }
}

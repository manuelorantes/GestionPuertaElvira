<?php

declare(strict_types=1);

namespace App\Domain\Classes\Error;

use DomainException;

final class AlreadyEnrolled extends DomainException
{
    public function __construct()
    {
        parent::__construct('El alumno ya está inscrito en ese grupo.');
    }
}

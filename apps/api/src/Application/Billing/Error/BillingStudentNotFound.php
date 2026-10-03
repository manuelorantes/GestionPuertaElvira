<?php

declare(strict_types=1);

namespace App\Application\Billing\Error;

use RuntimeException;

final class BillingStudentNotFound extends RuntimeException
{
    public function __construct()
    {
        parent::__construct('No existe ese alumno o no está de alta.');
    }
}

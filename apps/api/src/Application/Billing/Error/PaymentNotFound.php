<?php

declare(strict_types=1);

namespace App\Application\Billing\Error;

use RuntimeException;

final class PaymentNotFound extends RuntimeException
{
    public function __construct()
    {
        parent::__construct('No existe ese cobro.');
    }
}

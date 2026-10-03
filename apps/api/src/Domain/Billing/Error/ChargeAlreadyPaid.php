<?php

declare(strict_types=1);

namespace App\Domain\Billing\Error;

use DomainException;

final class ChargeAlreadyPaid extends DomainException
{
    public function __construct()
    {
        parent::__construct('Esa cuota ya está pagada.');
    }
}

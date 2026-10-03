<?php

declare(strict_types=1);

namespace App\Domain\Payroll\Error;

use DomainException;

final class SettlementAlreadyPaid extends DomainException
{
    public function __construct()
    {
        parent::__construct('La liquidación de ese profesor y mes ya está pagada: sus horas no se pueden cambiar.');
    }
}

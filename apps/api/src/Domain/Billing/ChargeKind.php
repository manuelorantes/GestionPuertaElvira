<?php

declare(strict_types=1);

namespace App\Domain\Billing;

enum ChargeKind: string
{
    case Monthly = 'monthly';
    case Membership = 'membership';
}

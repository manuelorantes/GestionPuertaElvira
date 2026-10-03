<?php

declare(strict_types=1);

namespace App\Domain\Billing;

enum ChargeStatus: string
{
    case Paid = 'paid';
    case Due = 'due';
    case Overdue = 'overdue';
    case Upcoming = 'upcoming';
}

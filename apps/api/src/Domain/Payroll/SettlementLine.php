<?php

declare(strict_types=1);

namespace App\Domain\Payroll;

use App\Domain\Common\Money;

final readonly class SettlementLine
{
    public function __construct(public string $label, public int $minutes, public Money $amount)
    {
    }
}

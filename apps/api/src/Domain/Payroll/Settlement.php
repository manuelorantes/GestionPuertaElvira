<?php

declare(strict_types=1);

namespace App\Domain\Payroll;

use App\Domain\Common\Money;

/** Cálculo de una liquidación: las líneas suman exactamente el importe. */
final readonly class Settlement
{
    /** @param list<SettlementLine> $lines */
    public function __construct(public int $minutes, public Money $rate, public Money $amount, public array $lines)
    {
    }
}

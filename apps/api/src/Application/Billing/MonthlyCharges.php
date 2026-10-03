<?php

declare(strict_types=1);

namespace App\Application\Billing;

/** Cuotas del mes con sus totales. */
final readonly class MonthlyCharges
{
    /** @param list<ChargeView> $items */
    public function __construct(
        public string $month,
        public array $items,
        public int $expectedCents,
        public int $collectedCents,
        public int $overdueCount,
    ) {
    }
}

<?php

declare(strict_types=1);

namespace App\Application\Accounting;

final readonly class FiscalYearView
{
    /** @param list<array{month: string, incomeCents: int, expenseCents: int, resultCents: int, accumulatedCents: int}> $months */
    public function __construct(
        public int $startYear,
        public string $label,
        public int $openingCents,
        public array $months,
        public int $incomeCents,
        public int $expenseCents,
        public int $resultCents,
        public bool $canClose,
        public ?string $closedOn,
    ) {
    }
}

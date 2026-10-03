<?php

declare(strict_types=1);

namespace App\Application\Accounting;

final readonly class MonthLedgerView
{
    /**
     * @param list<LedgerLine>                                               $lines
     * @param list<array{category: string, label: string, amountCents: int}> $expensesByCategory
     */
    public function __construct(
        public string $month,
        public array $lines,
        public int $incomeCents,
        public int $expenseCents,
        public array $expensesByCategory,
    ) {
    }
}

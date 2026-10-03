<?php

declare(strict_types=1);

namespace App\Application\Accounting;

use App\Application\Accounting\Port\LedgerQuery;
use App\Domain\Accounting\LedgerCategory;
use App\Domain\Common\YearMonth;

/** Movimientos del mes, del más reciente al más antiguo, con totales y gastos por categoría. */
final readonly class MonthLedger
{
    public function __construct(private LedgerQuery $ledger)
    {
    }

    public function __invoke(string $month): MonthLedgerView
    {
        $lines = $this->ledger->lines(YearMonth::fromString($month));
        usort($lines, static fn (LedgerLine $a, LedgerLine $b): int => [$b->date, $b->sourceId] <=> [$a->date, $a->sourceId]);

        $income = 0;
        $expenses = 0;
        $byCategory = [];
        foreach ($lines as $line) {
            if ('income' === $line->kind) {
                $income += $line->amountCents;
                continue;
            }
            $expenses += $line->amountCents;
            $byCategory[$line->category] = ($byCategory[$line->category] ?? 0) + $line->amountCents;
        }
        arsort($byCategory);

        return new MonthLedgerView(
            $month,
            $lines,
            $income,
            $expenses,
            array_map(
                static fn (string $category, int $amount): array => ['category' => $category, 'label' => LedgerCategory::fromName($category)->label(), 'amountCents' => $amount],
                array_map('strval', array_keys($byCategory)),
                array_values($byCategory),
            ),
        );
    }
}

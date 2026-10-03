<?php

declare(strict_types=1);

namespace App\Application\Accounting;

use App\Application\Accounting\Port\LedgerQuery;
use App\Application\Accounting\Port\SeasonClosingRepository;
use App\Domain\Accounting\FiscalYear;
use App\Domain\Common\Clock;
use App\Domain\Common\LocalDate;
use App\Domain\Common\YearMonth;

/** El ejercicio mes a mes: ingresos, gastos, resultado y acumulado desde el saldo arrastrado. */
final readonly class FiscalYearSummary
{
    public function __construct(private LedgerQuery $ledger, private SeasonClosingRepository $closings, private Clock $clock)
    {
    }

    public function __invoke(int $startYear): FiscalYearView
    {
        $year = new FiscalYear($startYear);
        $opening = 0;
        foreach ($this->closings->closings() as $closing) {
            if ($closing->year()->startYear < $startYear) {
                $opening += $closing->result()->cents;
            }
        }

        $months = [];
        $accumulated = $opening;
        $income = 0;
        $expenses = 0;
        foreach ($year->months() as $month) {
            [$monthIncome, $monthExpenses] = $this->totals($month);
            $accumulated += $monthIncome - $monthExpenses;
            $income += $monthIncome;
            $expenses += $monthExpenses;
            $months[] = ['month' => $month->toString(), 'incomeCents' => $monthIncome, 'expenseCents' => $monthExpenses, 'resultCents' => $monthIncome - $monthExpenses, 'accumulatedCents' => $accumulated];
        }

        $closing = $this->closings->closing($year);
        $current = YearMonth::of(LocalDate::fromInstant($this->clock->now()));

        return new FiscalYearView(
            $startYear,
            $year->label(),
            $opening,
            $months,
            $income,
            $expenses,
            $income - $expenses,
            null === $closing && !$current->isBefore($year->lastMonth()),
            $closing?->closedOn()->toString(),
        );
    }

    /** @return array{int, int} */
    public function totals(YearMonth $month): array
    {
        $income = 0;
        $expenses = 0;
        foreach ($this->ledger->lines($month) as $line) {
            'income' === $line->kind ? $income += $line->amountCents : $expenses += $line->amountCents;
        }

        return [$income, $expenses];
    }
}

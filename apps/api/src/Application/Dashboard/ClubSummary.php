<?php

declare(strict_types=1);

namespace App\Application\Dashboard;

use App\Application\Accounting\LedgerLine;
use App\Application\Accounting\MonthLedger;
use App\Application\Billing\ListMonthlyCharges;
use App\Application\Billing\Port\BillingQuery;
use App\Application\Classes\GroupSummary;
use App\Application\Classes\Port\ClassQuery;
use App\Application\Students\Port\StudentQuery;
use App\Application\Students\StudentFilter;
use App\Domain\Common\Clock;
use App\Domain\Common\LocalDate;
use App\Domain\Common\YearMonth;

/**
 * Resumen del club con cifras reales: lo compone a partir de Cobros, Contabilidad, Alumnado y Clases.
 */
final readonly class ClubSummary
{
    private const int CHART_MONTHS = 12;
    private const int LIST_SIZE = 6;

    public function __construct(
        private ListMonthlyCharges $charges,
        private BillingQuery $billing,
        private MonthLedger $ledger,
        private StudentQuery $students,
        private ClassQuery $classes,
        private Clock $clock,
    ) {
    }

    /** @return array<string, mixed> */
    public function __invoke(): array
    {
        $today = LocalDate::fromInstant($this->clock->now());
        $month = YearMonth::of($today);
        $charges = ($this->charges)($month->toString());

        $chart = [];
        $first = $month;
        for ($i = 1; $i < self::CHART_MONTHS; ++$i) {
            $first = self::previous($first);
        }
        $current = null;
        $previousLines = [];
        for ($m = $first, $i = 0; $i < self::CHART_MONTHS; $m = $m->next(), ++$i) {
            $view = ($this->ledger)($m->toString());
            $chart[] = ['month' => $m->toString(), 'incomeCents' => $view->incomeCents, 'expenseCents' => $view->expenseCents];
            if ($m->equals($month)) {
                $current = $view;
            } elseif ($m->next()->equals($month)) {
                $previousLines = $view->lines;
            }
        }

        $groups = $this->classes->groups($today);
        $capacity = array_sum(array_map(static fn (GroupSummary $g): int => $g->capacity, $groups));
        $occupied = array_sum(array_map(static fn (GroupSummary $g): int => min($g->occupied, $g->capacity), $groups));
        $emptiest = $groups;
        usort($emptiest, static fn (GroupSummary $a, GroupSummary $b): int => ($b->capacity - $b->occupied) <=> ($a->capacity - $a->occupied));

        return [
            'month' => $month->toString(),
            'today' => $today->toString(),
            'collectedCents' => $charges->collectedCents,
            'expectedCents' => $charges->expectedCents,
            'pendingCents' => $charges->expectedCents - $charges->collectedCents,
            'expensesCents' => $current->expenseCents ?? 0,
            'activeStudents' => \count($this->students->list(StudentFilter::Active, null, $today)),
            'registeredStudents' => $this->students->total(),
            'chart' => $chart,
            'occupancy' => [
                'percent' => $capacity > 0 ? (int) round($occupied * 100 / $capacity) : 0,
                'fullGroups' => \count(array_filter($groups, static fn (GroupSummary $g): bool => $g->occupied >= $g->capacity)),
                'emptiest' => array_map(static fn (GroupSummary $g): array => [
                    'id' => $g->id, 'name' => $g->name, 'teacherName' => $g->teacherName, 'occupied' => $g->occupied, 'capacity' => $g->capacity,
                ], \array_slice($emptiest, 0, 4)),
            ],
            'overdue' => \array_slice($this->billing->overdue($today), 0, self::LIST_SIZE),
            'latest' => \array_slice([...($current->lines ?? []), ...self::sorted($previousLines)], 0, self::LIST_SIZE),
        ];
    }

    private static function previous(YearMonth $month): YearMonth
    {
        return YearMonth::fromString(1 === $month->month ? \sprintf('%04d-12', $month->year - 1) : \sprintf('%04d-%02d', $month->year, $month->month - 1));
    }

    /**
     * @param list<LedgerLine> $lines
     *
     * @return list<LedgerLine>
     */
    private static function sorted(array $lines): array
    {
        usort($lines, static fn (LedgerLine $a, LedgerLine $b): int => $b->date <=> $a->date);

        return $lines;
    }
}

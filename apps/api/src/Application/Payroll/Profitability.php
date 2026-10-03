<?php

declare(strict_types=1);

namespace App\Application\Payroll;

use App\Application\Payroll\Port\PayrollQuery;
use App\Application\Payroll\Port\TeacherRates;

/**
 * Rentabilidad del mes por profesor: coste de su liquidación frente a los ingresos atribuidos a sus grupos.
 */
final readonly class Profitability
{
    public function __construct(private ListSettlements $settlements, private PayrollQuery $query, private TeacherRates $teachers)
    {
    }

    /** @return list<ProfitabilityRow> ordenadas por margen, de mayor a menor */
    public function __invoke(string $month): array
    {
        $settlements = [];
        foreach (($this->settlements)($month) as $settlement) {
            $settlements[$settlement->teacherId] = $settlement;
        }
        $activity = $this->query->activity(\App\Domain\Common\YearMonth::fromString($month));

        $rows = [];
        foreach ($this->teachers->all() as $teacher) {
            $s = $settlements[$teacher->id] ?? null;
            $a = $activity[$teacher->id] ?? null;
            if (null === $s && null === $a) {
                continue;
            }
            $minutes = $s->minutes ?? 0;
            $cost = $s->amountCents ?? 0;
            $income = $a->incomeCents ?? 0;
            $rows[] = new ProfitabilityRow(
                $teacher->id,
                $teacher->name,
                $a->groups ?? [],
                $minutes,
                $s->rateCents ?? $teacher->rate->cents,
                $cost,
                $income,
                $income - $cost,
                $minutes > 0 ? (int) round($income * 60 / $minutes) : null,
                $a->occupied ?? 0,
                $a->capacity ?? 0,
            );
        }
        usort($rows, static fn (ProfitabilityRow $a, ProfitabilityRow $b): int => $b->marginCents <=> $a->marginCents);

        return $rows;
    }
}

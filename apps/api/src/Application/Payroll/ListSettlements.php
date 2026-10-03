<?php

declare(strict_types=1);

namespace App\Application\Payroll;

use App\Application\Payroll\Port\SettlementRepository;
use App\Application\Payroll\Port\TeacherRates;
use App\Application\Payroll\Port\TimesheetRepository;
use App\Domain\Common\YearMonth;
use App\Domain\Payroll\Settlement;
use App\Domain\Payroll\SettlementCalculator;
use App\Domain\Payroll\SettlementLine;
use App\Domain\Payroll\TimesheetEntry;

/** Liquidaciones del mes: las pagadas tal como se congelaron y las pendientes con las horas y tarifa actuales. */
final readonly class ListSettlements
{
    public function __construct(
        private TimesheetRepository $timesheets,
        private SettlementRepository $settlements,
        private TeacherRates $teachers,
    ) {
    }

    /** @return list<SettlementView> ordenadas por nombre */
    public function __invoke(string $month): array
    {
        $period = YearMonth::fromString($month);
        $byTeacher = [];
        foreach ($this->timesheets->forMonth($period) as $entry) {
            $byTeacher[$entry->teacher()->value][] = $entry;
        }
        $paid = [];
        foreach ($this->settlements->settlementsOf($period) as $settlement) {
            $paid[$settlement->teacher->value] = $settlement;
        }

        $views = [];
        foreach ($this->teachers->all() as $teacher) {
            $settled = $paid[$teacher->id] ?? null;
            /** @var list<TimesheetEntry> $entries */
            $entries = $byTeacher[$teacher->id] ?? [];
            if (null === $settled && [] === $entries) {
                continue;
            }
            $settlement = $settled->settlement ?? new SettlementCalculator()->settle($entries, $teacher->rate);
            $views[] = self::view($teacher, $period, $settlement, $settled?->paidOn->toString());
        }
        usort($views, static fn (SettlementView $a, SettlementView $b): int => strcoll($a->teacherName, $b->teacherName));

        return $views;
    }

    private static function view(TeacherRate $teacher, YearMonth $month, Settlement $s, ?string $paidOn): SettlementView
    {
        return new SettlementView(
            $teacher->id,
            $teacher->name,
            $month->toString(),
            $s->minutes,
            $s->rate->cents,
            $s->amount->cents,
            array_map(static fn (SettlementLine $l): array => ['label' => $l->label, 'minutes' => $l->minutes, 'amountCents' => $l->amount->cents], $s->lines),
            null === $paidOn ? 'pending' : 'paid',
            $paidOn,
        );
    }
}

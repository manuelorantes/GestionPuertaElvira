<?php

declare(strict_types=1);

namespace App\Application\Payroll;

use App\Application\Payroll\Port\SettlementRepository;
use App\Application\Payroll\Port\TeacherRates;
use App\Application\Payroll\Port\TimesheetRepository;
use App\Domain\Common\InvalidValue;
use App\Domain\Common\LocalDate;
use App\Domain\Common\YearMonth;
use App\Domain\Payroll\MonthlySettlement;
use App\Domain\Payroll\SettlementCalculator;
use App\Domain\Payroll\TeacherRef;
use App\Domain\Payroll\TimesheetEntry;

/** Marca como pagada la liquidación de un profesor y mes, congelando horas, tarifa e importe. */
final readonly class PaySettlement
{
    public function __construct(
        private TimesheetRepository $timesheets,
        private SettlementRepository $settlements,
        private TeacherRates $teachers,
    ) {
    }

    public function __invoke(string $teacherId, string $month, string $paidOn): void
    {
        $teacher = TeacherRef::fromString($teacherId);
        $period = YearMonth::fromString($month);
        SettlementGuard::ensureOpen($this->settlements, $teacher, $period);
        $rate = array_values(array_filter($this->teachers->all(), static fn (TeacherRate $t): bool => $t->id === $teacher->value))[0]
            ?? throw new InvalidValue('teacherId', 'Ese profesor no existe.');
        $entries = array_values(array_filter($this->timesheets->forMonth($period), static fn (TimesheetEntry $e): bool => $e->teacher()->equals($teacher)));
        if ([] === $entries) {
            throw new InvalidValue('month', 'Ese profesor no tiene horas registradas en el mes.');
        }

        $this->settlements->saveSettlement(new MonthlySettlement($teacher, $period, new SettlementCalculator()->settle($entries, $rate->rate), LocalDate::fromString($paidOn)));
    }
}

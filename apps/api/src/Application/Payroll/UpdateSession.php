<?php

declare(strict_types=1);

namespace App\Application\Payroll;

use App\Application\Payroll\Error\SessionNotFound;
use App\Application\Payroll\Port\SettlementRepository;
use App\Application\Payroll\Port\TimesheetRepository;
use App\Domain\Payroll\SessionMinutes;
use App\Domain\Payroll\TeacherRef;
use App\Domain\Payroll\TimesheetEntryId;

/** Cambia el profesor (sustitución) o las horas de una sesión. */
final readonly class UpdateSession
{
    public function __construct(private TimesheetRepository $timesheets, private SettlementRepository $settlements)
    {
    }

    public function __invoke(string $id, string $teacherId, float $hours): void
    {
        $entry = $this->timesheets->entry(TimesheetEntryId::fromString($id)) ?? throw new SessionNotFound();
        $teacher = TeacherRef::fromString($teacherId);
        SettlementGuard::ensureOpen($this->settlements, $entry->teacher(), $entry->month());
        SettlementGuard::ensureOpen($this->settlements, $teacher, $entry->month());

        $entry->reassign($teacher);
        $entry->changeDuration(SessionMinutes::fromHours($hours));
        $this->timesheets->save($entry);
    }
}

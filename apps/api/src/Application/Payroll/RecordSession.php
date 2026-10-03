<?php

declare(strict_types=1);

namespace App\Application\Payroll;

use App\Application\Payroll\Port\ScheduleDirectory;
use App\Application\Payroll\Port\SettlementRepository;
use App\Application\Payroll\Port\TimesheetRepository;
use App\Domain\Common\InvalidValue;
use App\Domain\Common\LocalDate;
use App\Domain\Payroll\GroupRef;
use App\Domain\Payroll\ScheduledGroup;
use App\Domain\Payroll\SessionMinutes;
use App\Domain\Payroll\TeacherRef;
use App\Domain\Payroll\TimesheetEntry;
use App\Domain\Payroll\TimesheetEntryId;

/** Añade a mano una sesión de un grupo (p. ej. una recuperación) u otra actividad. */
final readonly class RecordSession
{
    public function __construct(
        private TimesheetRepository $timesheets,
        private SettlementRepository $settlements,
        private ScheduleDirectory $schedule,
    ) {
    }

    public function __invoke(SessionInput $input): string
    {
        $teacher = TeacherRef::fromString($input->teacherId);
        $date = LocalDate::fromString($input->date);
        $group = null;
        $label = (string) $input->activity;
        if (null !== $input->groupId && '' !== $input->groupId) {
            $groupId = GroupRef::fromString($input->groupId);
            $match = array_values(array_filter($this->schedule->groups(), static fn (ScheduledGroup $g): bool => $g->id->equals($groupId)))[0]
                ?? throw new InvalidValue('groupId', 'Ese grupo no existe.');
            $group = $match->id;
            $label = $match->name;
        }

        $entry = TimesheetEntry::record(TimesheetEntryId::generate(), $teacher, $date, $group, $label, SessionMinutes::fromHours($input->hours), false);
        SettlementGuard::ensureOpen($this->settlements, $teacher, $entry->month());
        $this->timesheets->save($entry);

        return $entry->id()->value;
    }
}

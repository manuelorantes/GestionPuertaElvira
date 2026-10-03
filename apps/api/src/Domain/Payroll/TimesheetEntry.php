<?php

declare(strict_types=1);

namespace App\Domain\Payroll;

use App\Domain\Common\InvalidValue;
use App\Domain\Common\LocalDate;
use App\Domain\Common\YearMonth;

/** Sesión impartida (de un grupo u otra actividad) que se paga en la liquidación del mes. */
final class TimesheetEntry
{
    private function __construct(
        private readonly TimesheetEntryId $id,
        private TeacherRef $teacher,
        private readonly LocalDate $date,
        private readonly ?GroupRef $group,
        private readonly string $label,
        private SessionMinutes $minutes,
        private readonly bool $fromSchedule,
    ) {
    }

    public static function record(TimesheetEntryId $id, TeacherRef $teacher, LocalDate $date, ?GroupRef $group, string $label, SessionMinutes $minutes, bool $fromSchedule): self
    {
        if ('' === trim($label)) {
            throw new InvalidValue('label', 'Indica la clase o la actividad.');
        }

        return new self($id, $teacher, $date, $group, trim($label), $minutes, $fromSchedule);
    }

    public function reassign(TeacherRef $teacher): void
    {
        $this->teacher = $teacher;
    }

    public function changeDuration(SessionMinutes $minutes): void
    {
        $this->minutes = $minutes;
    }

    public function month(): YearMonth
    {
        return YearMonth::of($this->date);
    }

    public function id(): TimesheetEntryId
    {
        return $this->id;
    }

    public function teacher(): TeacherRef
    {
        return $this->teacher;
    }

    public function date(): LocalDate
    {
        return $this->date;
    }

    public function group(): ?GroupRef
    {
        return $this->group;
    }

    public function label(): string
    {
        return $this->label;
    }

    public function minutes(): SessionMinutes
    {
        return $this->minutes;
    }

    public function isFromSchedule(): bool
    {
        return $this->fromSchedule;
    }
}

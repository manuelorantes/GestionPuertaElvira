<?php

declare(strict_types=1);

namespace App\Domain\Classes;

use App\Domain\Common\InvalidValue;
use App\Domain\Common\LocalDate;

/**
 * Inscripción de un alumno en un grupo, desde una fecha y, opcionalmente, hasta otra (no incluida).
 */
final class Enrolment
{
    private function __construct(
        private readonly EnrolmentId $id,
        private readonly StudentReference $student,
        private readonly ClassGroupId $group,
        private readonly LocalDate $enrolledOn,
        private ?LocalDate $endsOn,
    ) {
    }

    public static function start(EnrolmentId $id, StudentReference $student, ClassGroupId $group, LocalDate $on): self
    {
        return new self($id, $student, $group, $on, null);
    }

    public static function restore(EnrolmentId $id, StudentReference $student, ClassGroupId $group, LocalDate $enrolledOn, ?LocalDate $endsOn): self
    {
        return new self($id, $student, $group, $enrolledOn, $endsOn);
    }

    public function endOn(LocalDate $day): void
    {
        if ($day->isBefore($this->enrolledOn)) {
            throw new InvalidValue('date', 'La inscripción no puede terminar antes de empezar.');
        }

        $this->endsOn = $day;
    }

    public function isActiveOn(LocalDate $day): bool
    {
        $hasStarted = $day->isAfterOrEqual($this->enrolledOn);
        $hasEnded = null !== $this->endsOn && $day->isAfterOrEqual($this->endsOn);

        return $hasStarted && !$hasEnded;
    }

    public function id(): EnrolmentId
    {
        return $this->id;
    }

    public function student(): StudentReference
    {
        return $this->student;
    }

    public function group(): ClassGroupId
    {
        return $this->group;
    }

    public function enrolledOn(): LocalDate
    {
        return $this->enrolledOn;
    }

    public function endsOn(): ?LocalDate
    {
        return $this->endsOn;
    }
}
